// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721TokenReceiver} from "../../lib/autonolas-registries/lib/solmate/src/tokens/ERC721.sol";
import {IService} from "./interfaces/IService.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

// ERC20 token interface
interface IToken {
    /// @dev Gets the amount of tokens owned by a specified account.
    /// @param account Account address.
    /// @return Amount of tokens owned.
    function balanceOf(address account) external view returns (uint256);
}

/// @dev Zero address.
error ZeroAddress();

/// @dev Zero value.
error ZeroValue();

/// @dev Only `staker` has a privilege, but the `sender` was provided.
/// @param sender Sender address.
/// @param staker Required staker address.
error StakerOnly(address sender, address staker);

/// @dev Service is already staked.
/// @param serviceId Service Id.
error AlreadyStaked(uint256 serviceId);

/// @dev Wrong service staking state.
/// @param serviceId Service Id.
/// @param state Service state.
error WrongStakingState(uint256 serviceId, IStaking.StakingState state);

/// @dev Caught reentrancy violation.
error ReentrancyGuard();

/// @title DualStakingToken - Smart contract for dual token staking: it accepts OLAS-based service NFT
///        and a deposit of defined second ERC20 token that is proportionally calculated to OLAS service stake amount
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract DualStakingToken is ERC721TokenReceiver {
    event Deposit(address indexed sender, uint256 amount, uint256 balance, uint256 availableRewards);
    event Withdraw(address indexed to, uint256 amount);
    event Staked(uint256 indexed serviceId);
    event Claimed(uint256 indexed serviceId, uint256 reward);
    event Unstaked(uint256 indexed serviceId);

    // Service registry address
    address public immutable serviceRegistry;
    // Second token address (except for OLAS)
    address public immutable secondToken;
    // OLAS service staking instance address
    address public immutable stakingInstance;
    // Required second token amount
    uint256 public immutable secondTokenAmount;
    // Second token stake ratio to OLAS in 1e18 form
    uint256 public immutable stakeRatio;
    // Second token reward ratio to OLAS in 1e18 form
    uint256 public immutable rewardRatio;

    // Number of staked services
    uint256 public numServices;

    // Reentrancy lock
    uint256 internal _locked = 1;

    // Mapping of service Id => staker account address
    mapping(uint256 => address) public mapServiceIdStakers;
    /// Mapping of staked OLAS service multisigs
    mapping(address => bool) public mapMutisigs;

    /// @dev DualStakingToken constructor.
    /// @param _serviceRegistry Service registry address.
    /// @param _secondToken Second token address that is deposited along with OLAS-based service.
    /// @param _stakingInstance Service staking instance address.
    /// @param _stakeRatio Second token deposit ratio to OLAS in 1e18 form.
    /// @param _rewardRatio Second token reward ratio to OLAS in 1e18 form.
    constructor(
        address _serviceRegistry,
        address _secondToken,
        address _stakingInstance,
        uint256 _stakeRatio,
        uint256 _rewardRatio
    ) {
        // Check for zero addresses
        if (_serviceRegistry == address(0) || _secondToken == address(0) || _stakingInstance == address(0)) {
            revert ZeroAddress();
        }

        // Check for zero values
        if (_stakeRatio == 0 || _rewardRatio == 0) {
            revert ZeroValue();
        }

        serviceRegistry = _serviceRegistry;
        secondToken = _secondToken;
        stakingInstance = _stakingInstance;
        stakeRatio = _stakeRatio;
        rewardRatio = _rewardRatio;

        // Calculate second token amount based on staking instance service information
        uint256 numAgentInstances = IStaking(_stakingInstance).numAgentInstances();
        uint256 minStakingDeposit = IStaking(_stakingInstance).minStakingDeposit();
        // Total service deposit = minStakingDeposit + minStakingDeposit * numAgentInstances
        secondTokenAmount = (minStakingDeposit * (1 + numAgentInstances) * _stakeRatio) / 1e18;
    }

    /// @dev Claims second token reward.
    /// @notice reward value must be non-zero by implementation requirement.
    /// @param multisig Service multisig address.
    /// @param reward Second token non-zero reward.
    function _claim(address multisig, uint256 reward) internal {
        // Recalculate reward in second token value
        reward = (reward * rewardRatio) / 1e18;

        // Transfer second token reward to the service multisig
        // Get second token balance, reserving the staked amount untouched
        uint256 balance = IToken(secondToken).balanceOf(address(this)) - secondTokenAmount * numServices;

        // Limit reward if there is not enough on a balance
        if (reward > balance) {
            reward = balance;
        }

        // Withdraw reward to service multisig
        if (reward > 0) {
            _withdraw(multisig, reward);
        }
    }

    /// @dev Withdraws the reward amount to a service owner.
    /// @notice The balance is always greater or equal the amount, as follows from the Base contract logic.
    /// @param to Address to.
    /// @param amount Amount to withdraw.
    function _withdraw(address to, uint256 amount) internal {
        SafeTransferLib.safeTransfer(secondToken, to, amount);

        emit Withdraw(to, amount);
    }

    /// @dev Stakes OLAS service Id and required second token amount.
    /// @param serviceId OLAS driven service Id.
    function stake(uint256 serviceId) external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        address staker = mapServiceIdStakers[serviceId];
        // Check for existing staker
        if (staker != address(0)) {
            revert AlreadyStaked(serviceId);
        }

        // Get service multisig
        (, address multisig, , , , , ) = IService(serviceRegistry).mapServices(serviceId);

        // Record staker address
        mapServiceIdStakers[serviceId] = msg.sender;

        // Record service multisig as being active in this staking contract
        mapMutisigs[multisig] = true;

        // Increase global number of services
        numServices++;

        // Get second token stake amount
        SafeTransferLib.safeTransferFrom(secondToken, msg.sender, address(this), secondTokenAmount);

        // Get service for staking
        IService(serviceRegistry).safeTransferFrom(msg.sender, address(this), serviceId);

        // Approve service for staking instance
        IService(serviceRegistry).approve(stakingInstance, serviceId);
        // Stake service
        IStaking(stakingInstance).stake(serviceId);

        emit Staked(serviceId);

        _locked = 1;
    }

    /// @dev Checkpoint to allocate rewards up until current time.
    function checkpoint() external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Service staking checkpoint
        IStaking(stakingInstance).checkpoint();

        _locked = 1;
    }

    /// @dev Re-stakes OLAS service Id as it has been evicted.
    /// @notice The restake can only take place if the service is evicted in the original stakingInstance contract,
    ///         otherwise it will revert. Another alternative is to call the unstake, then stake from scratch.
    /// @param serviceId OLAS driven service Id.
    function restake(uint256 serviceId) external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Get staker address
        address staker = mapServiceIdStakers[serviceId];
        // Check for staker access
        // This covers both access and service existence check
        if (msg.sender != staker) {
            revert StakerOnly(msg.sender, staker);
        }

        // Get staked service state
        IStaking.StakingState stakingState = IStaking(stakingInstance).getStakingState(serviceId);
        // Check for evicted service state
        if (stakingState != IStaking.StakingState.Evicted) {
            revert WrongStakingState(serviceId, stakingState);
        }

        // Unstake OLAS service
        IStaking(stakingInstance).unstake(serviceId);
        // Approve back to staking instance
        IService(serviceRegistry).approve(stakingInstance, serviceId);
        // Stake service
        IStaking(stakingInstance).stake(serviceId);

        _locked = 1;
    }

    /// @dev Unstakes OLAS service Id and unbonds second token amount.
    /// @param serviceId OLAS driven service Id.
    function unstake(uint256 serviceId) external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Get staker address
        address staker = mapServiceIdStakers[serviceId];
        // Check for staker access
        // This covers both access and service existence check
        if (msg.sender != staker) {
            revert StakerOnly(msg.sender, staker);
        }

        // Get service multisig
        (, address multisig, , , , , ) = IService(serviceRegistry).mapServices(serviceId);

        // Clear staker maps
        delete mapServiceIdStakers[serviceId];
        delete mapMutisigs[multisig];

        // Decrease global service counter
        numServices--;

        // Transfer second token staking amount back to the staker
        _withdraw(staker, secondTokenAmount);

        // Claim OLAS service reward and unstake
        uint256 reward = IStaking(stakingInstance).unstake(serviceId);

        // Check for non-zero OLAS reward
        // No revert if reward is zero as there might be rewards from OLAS staking
        if (reward > 0) {
            // Claim second token reward
            _claim(multisig, reward);

            emit Claimed(serviceId, reward);
        }

        // Transfer service to the original owner
        IService(serviceRegistry).transferFrom(address(this), staker, serviceId);

        emit Unstaked(serviceId);

        _locked = 1;
    }

    /// @dev Claims OLAS and second token rewards.
    /// @param serviceId OLAS driven service Id.
    function claim(uint256 serviceId) external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Get staker address
        address staker = mapServiceIdStakers[serviceId];
        // Check for staker access
        // This covers both access and service existence check
        if (msg.sender != staker) {
            revert StakerOnly(msg.sender, staker);
        }

        // Claim OLAS service reward
        uint256 reward = IStaking(stakingInstance).claim(serviceId);

        // Check for non-zero OLAS reward
        // No revert if reward is zero as there might be rewards from OLAS staking
        if (reward > 0) {
            // Get service multisig
            (, address multisig, , , , , ) = IService(serviceRegistry).mapServices(serviceId);

            // Claim second token reward
            _claim(multisig, reward);

            emit Claimed(serviceId, reward);
        }

        _locked = 1;
    }

    /// @dev Staticcall to all the other incoming data.
    fallback() external {
        address instance = stakingInstance;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let success := staticcall(gas(), instance, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            if eq(success, 0) {
                revert(0, returndatasize())
            }
            return(0, returndatasize())
        }
    }
}