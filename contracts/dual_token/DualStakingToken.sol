// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IService} from "./interfaces/IService.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IActivityChecker {
    /// @dev Locks activity checker.
    function lock() external;

    /// @dev Unlocks activity checker.
    function unlock() external;
}

/// @dev Zero address.
error ZeroAddress();

/// @dev Zero value.
error ZeroValue();

/// @dev Only `owner` has a privilege, but the `sender` was provided.
/// @param sender Sender address.
/// @param owner Required sender address as an owner.
error OwnerOnly(address sender, address owner);

struct StakerInfo {
    // Staking token amount
    uint256 stakingAmount;
    // Cumulative reward
    uint256 reward;
    // Staker account address
    address account;
    // Service staking instance address
    address stakingInstance;
}

/// @title DualStakingToken - Smart contract for dual token staking
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract DualStakingToken {
    event OwnerUpdated(address indexed owner);
    event StakingTokenParamsUpdated(uint256 stakingTokenAmount, uint256 rewardRatio);
    event Deposit(address indexed sender, uint256 amount, uint256 balance, uint256 availableRewards);
    event Withdraw(address indexed to, uint256 amount);

    // Staking token address (except for OLAS)
    address public immutable stakingToken;
    // Service registry address
    address public immutable serviceRegistry;

    // Required staking token amount
    uint256 public stakingTokenAmount;
    // Staking token ratio to OLAS rewards in 1e18 form
    uint256 public rewardRatio;
    // Staking token contract balance
    uint256 public balance;
    // Staking token available rewards
    uint256 public availableRewards;
    // Owner address
    address public owner;

    // Mapping of staker account address => Staker info struct
    mapping(uint256 => StakerInfo) public mapStakerStakerInfos;
    /// Mapping of staked OLAS service multisigs
    mapping(address => bool) public mapMutisigs;

    /// @dev DualStakingToken constructor.
    /// @param _serviceRegistry Service registry address.
    /// @param _stakingToken Staking token address.
    /// @param _stakingTokenAmount Staking token amount.
    /// @param _rewardRatio Staking token ratio to OLAS rewards in 1e18 form.
    constructor(address _serviceRegistry, address _stakingToken, uint256 _stakingTokenAmount, uint256 _rewardRatio) {
        // Check for zero addresses
        if (_serviceRegistry == address(0) || _stakingToken == address(0)) {
            revert ZeroAddress();
        }

        // Check for zero values
        if (_stakingTokenAmount == 0 || _rewardRatio == 0) {
            revert ZeroValue();
        }

        serviceRegistry = _serviceRegistry;
        stakingToken = _stakingToken;

        stakingTokenAmount = _stakingTokenAmount;
        rewardRatio = _rewardRatio;

        owner = msg.sender;
    }

    /// @dev Withdraws the reward amount to a service owner.
    /// @notice The balance is always greater or equal the amount, as follows from the Base contract logic.
    /// @param to Address to.
    /// @param amount Amount to withdraw.
    function _withdraw(address to, uint256 amount) internal {
        // Update the contract balance
        balance -= amount;

        SafeTransferLib.safeTransfer(stakingToken, to, amount);

        emit Withdraw(to, amount);
    }

    /// @dev Changes contract owner address.
    /// @param newOwner Address of a new owner.
    function changeOwner(address newOwner) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for the zero address
        if (newOwner == address(0)) {
            revert ZeroAddress();
        }

        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function changeStakingTokenParams(uint256 newStakingTokenAmount, uint256 newRewardRatio) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for zero values
        if (newStakingTokenAmount == 0 || newRewardRatio == 0) {
            revert ZeroValue();
        }

        stakingTokenAmount = newStakingTokenAmount;
        rewardRatio = newRewardRatio;

        emit StakingTokenParamsUpdated(newStakingTokenAmount, newRewardRatio);
    }

    /// @dev Stakes OLAS service Id and required staking token amount.
    /// @param serviceId OLAS driven service Id.
    /// @param stakingInstance Staking instance address.
    function stake(uint256 serviceId, address stakingInstance) external {
        StakerInfo storage stakerInfo = mapStakerStakerInfos[serviceId];
        // Check for existing staker
        if (stakerInfo.account != address(0)) {
            revert();
        }

        uint256 amount = stakingTokenAmount;

        // Record staker info values
        stakerInfo.account = msg.sender;
        stakerInfo.stakingAmount = amount;
        stakerInfo.stakingInstance = stakingInstance;

        // Get service multisig
        (, address multisig, , , , , ) = IService(serviceRegistry).mapServices(serviceId);

        mapMutisigs[multisig] = true;

        SafeTransferLib.safeTransferFrom(stakingToken, msg.sender, address(this), amount);

        IService(serviceRegistry).safeTransferFrom(msg.sender, address(this), serviceId);

        // Approve service for staking instance
        IService(serviceRegistry).approve(stakingInstance, serviceId);
        // Stake service
        IStaking(stakingInstance).stake(serviceId);
    }

    /// @dev Checkpoint to allocate rewards up until current time.
    /// @param stakingInstance Staking instance address.
    function checkpoint(address stakingInstance) public {
        // Get activity checker address
        address activityChecker = IStaking(stakingInstance).activityChecker();

        // Unlock activity checker while performing checkpoint
        IActivityChecker(activityChecker).unlock();

        // Service staking checkpoint
        (, uint256[] memory eligibleServiceIds, uint256[] memory eligibleServiceRewards, ) =
            IStaking(stakingInstance).checkpoint();

        // Process rewards
        // If there are eligible services, calculate and update staking token rewards
        uint256 numServices = eligibleServiceIds.length;
        if (numServices > 0) {
            uint256 lastAvailableRewards = availableRewards;
            uint256 totalRewards;
            for (uint256 i = 0; i < numServices; ++i) {
                totalRewards += eligibleServiceRewards[i];
            }

            uint256 curServiceId;
            // If total allocated rewards are not enough, adjust the reward value
            if ((totalRewards * rewardRatio) / 1e18 > lastAvailableRewards) {
                // Traverse all the eligible services and adjust their rewards proportional to leftovers
                // Note the algorithm is the exact copy of StakingBase logic
                uint256 updatedReward;
                uint256 updatedTotalRewards;
                for (uint256 i = 1; i < numServices; ++i) {
                    // Calculate the updated reward
                    updatedReward = (eligibleServiceRewards[i] * lastAvailableRewards) / totalRewards;
                    // Add to the total updated reward
                    updatedTotalRewards += updatedReward;

                    curServiceId = eligibleServiceIds[i];
                    // Add reward to the overall service reward
                    mapStakerStakerInfos[curServiceId].reward += (updatedReward * rewardRatio) / 1e18;
                }

                // Process the first service in the set
                updatedReward = (eligibleServiceRewards[0] * lastAvailableRewards) / totalRewards;
                updatedTotalRewards += updatedReward;
                curServiceId = eligibleServiceIds[0];
                // If the reward adjustment happened to have small leftovers, add it to the first service
                if (lastAvailableRewards > updatedTotalRewards) {
                    updatedReward += lastAvailableRewards - updatedTotalRewards;
                }
                // Add reward to the overall service reward
                mapStakerStakerInfos[curServiceId].reward += (updatedReward * rewardRatio) / 1e18;
                // Set available rewards to zero
                lastAvailableRewards = 0;
            } else {
                // Traverse all the eligible services and add to their rewards
                for (uint256 i = 0; i < numServices; ++i) {
                    // Add reward to the service overall reward
                    curServiceId = eligibleServiceIds[i];
                    mapStakerStakerInfos[curServiceId].reward += (eligibleServiceRewards[i] * rewardRatio) / 1e18;
                }

                // Adjust available rewards
                lastAvailableRewards -= totalRewards;
            }

            // Update the storage value of available rewards
            availableRewards = lastAvailableRewards;
        }

        // Lock activity checker after checkpoint
        IActivityChecker(activityChecker).lock();
    }

    /// @dev Re-stakes OLAS service Id as it has been evicted.
    /// @param serviceId OLAS driven service Id.
    function restake(uint256 serviceId) external {
        StakerInfo storage stakerInfo = mapStakerStakerInfos[serviceId];
        // Check for staker existence
        if (stakerInfo.account == address(0)) {
            revert();
        }

        // Get staking instance address
        address stakingInstance = stakerInfo.stakingInstance;

        // Perform checkpoint first as there might be more rewards
        checkpoint(stakingInstance);

        // Get staked service state
        IStaking.StakingState stakingState = IStaking(stakingInstance).getStakingState(serviceId);
        // Check for evicted service state
        if (stakingState != IStaking.StakingState.Evicted) {
            revert();
        }

        // Unstake OLAS service
        IStaking(stakingInstance).unstake(serviceId);
        // Approve back to staking instance
        IService(serviceRegistry).approve(stakingInstance, serviceId);
        // Stake service
        IStaking(stakingInstance).stake(serviceId);
    }

    /// @dev Unstakes OLAS service Id and unbonds staking token amount.
    /// @param serviceId OLAS driven service Id.
    function unstake(uint256 serviceId) external {
        StakerInfo storage stakerInfo = mapStakerStakerInfos[serviceId];
        // Check for staker existence
        if (stakerInfo.account == address(0)) {
            revert();
        }

        // Get staking instance
        address stakingInstance = stakerInfo.stakingInstance;

        // Perform checkpoint first as there might be more rewards
        checkpoint(stakingInstance);

        // Get staker info
        address account = stakerInfo.account;
        uint256 stakingAmount = stakerInfo.stakingAmount;
        uint256 reward = stakerInfo.reward;

        // Get service multisig
        (, address multisig, , , , , ) = IService(serviceRegistry).mapServices(serviceId);

        // Clear staker maps
        delete mapStakerStakerInfos[serviceId];
        delete mapMutisigs[multisig];

        // Unstake OLAS service
        IStaking(stakingInstance).unstake(serviceId);

        // Transfer service to the original owner
        IService(serviceRegistry).transferFrom(address(this), account, serviceId);

        // Transfer staking token amount back to the staker
        _withdraw(account, stakingAmount);

        // TODO Reward is sent to the service multisig or staker account?
        // Transfer staking token reward to the service multisig
        _withdraw(multisig, reward);
    }

    /// @dev Claims OLAS staking token rewards.
    /// @param serviceId OLAS driven service Id.
    function claim(uint256 serviceId) external {
        StakerInfo storage stakerInfo = mapStakerStakerInfos[serviceId];
        // Check for staker existence
        if (stakerInfo.account == address(0)) {
            revert();
        }

        // Get staking instance
        address stakingInstance = stakerInfo.stakingInstance;

        // Perform checkpoint first as there might be more rewards
        checkpoint(stakingInstance);

        // Get reward
        uint256 reward = stakerInfo.reward;

        // Get service multisig
        (, address multisig, , , , , ) = IService(serviceRegistry).mapServices(serviceId);

        // Claim OLAS
        IStaking(stakingInstance).claim(serviceId);

        // TODO Reward is sent to the service multisig or staker account?
        // Transfer staking token reward to the service multisig
        _withdraw(multisig, reward);
    }

    /// @dev Deposits funds for dual staking.
    /// @param amount Token amount to deposit.
    function deposit(uint256 amount) external {
        // Add to the contract and available rewards balances
        uint256 newBalance = balance + amount;
        uint256 newAvailableRewards = availableRewards + amount;

        // Record the new actual balance and available rewards
        balance = newBalance;
        availableRewards = newAvailableRewards;

        // Add to the overall balance
        SafeTransferLib.safeTransferFrom(stakingToken, msg.sender, address(this), amount);

        emit Deposit(msg.sender, amount, newBalance, newAvailableRewards);
    }
}