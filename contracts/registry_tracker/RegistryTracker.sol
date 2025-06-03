// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Service registry related interface
interface IServiceRegistry {
    enum ServiceState {
        NonExistent,
        PreRegistration,
        ActiveRegistration,
        FinishedRegistration,
        Deployed,
        TerminatedBonded
    }

    /// @dev Gets the service instance from the map of services.
    /// @param serviceId Service Id.
    /// @return securityDeposit Registration activation deposit.
    /// @return multisig Service multisig address.
    /// @return configHash IPFS hashes pointing to the config metadata.
    /// @return threshold Agent instance signers threshold.
    /// @return maxNumAgentInstances Total number of agent instances.
    /// @return numAgentInstances Actual number of agent instances.
    /// @return state Service state.
    function mapServices(uint256 serviceId) external view returns (uint96 securityDeposit, address multisig,
        bytes32 configHash, uint32 threshold, uint32 maxNumAgentInstances, uint32 numAgentInstances, ServiceState state);

    /// @dev Gets the owner of the token Id.
    /// @param tokenId Token Id.
    /// @return Token Id owner address.
    function ownerOf(uint256 tokenId) external view returns (address);
}

// Staking interface
interface IStaking {
    enum StakingState {
        Unstaked,
        Staked,
        Evicted
    }

    /// @dev Gets the service staking state.
    /// @param serviceId.
    /// @return stakingState Staking state of the service.
    function getStakingState(uint256 serviceId) external view returns (StakingState stakingState);
}

/// @dev Zero address.
error ZeroAddress();

/// @dev Zero value.
error ZeroValue();

/// @dev Account is unauthorized.
/// @param account Account address.
error UnauthorizedAccount(address account);

/// @dev Wrong service state.
/// @param serviceId Service Id.
/// @param state Service state.
error WrongServiceState(uint256 serviceId, IServiceRegistry.ServiceState state);

/// @dev Service Id is already registered.
/// @param multisig Service multisig address.
/// @param serviceId Service Id.
error AlreadyRegistered(address multisig, uint256 serviceId);

/// @dev Wrong service staking state.
/// @param serviceId Service Id.
/// @param stakingInstance Staking instance address.
/// @param state Service staking state.
error WrongStakingState(uint256 serviceId, address stakingInstance, IStaking.StakingState state);

/// @dev Caught reentrancy violation.
error ReentrancyGuard();

/// @title RegistryTracker - Smart contract for initial staking reward incentives
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract RegistryTracker {
    event OwnerUpdated(address indexed owner);
    event RewardPeriodUpdated(uint256 rewardPeriod);
    event ServiceMultisigRegistered(address indexed multisig, uint256 indexed serviceId);

    // Service registry address
    address public immutable serviceRegistry;
    // Reward period in seconds
    uint256 public rewardPeriod;

    // Owner address
    address public owner;

    // Reentrancy lock
    uint256 internal _locked = 1;

    /// Mapping of service multisigs => timestamp of multisig registration
    mapping(address => uint256) public mapMultisigRegisteringTime;

    /// @dev RegistryTracker constructor.
    /// @param _serviceRegistry Service registry address.
    /// @param _rewardPeriod Reward period in seconds.
    constructor(address _serviceRegistry, uint256 _rewardPeriod) {
        // Check for zero addresses
        if (_serviceRegistry == address(0)) {
            revert ZeroAddress();
        }

        // Check for zero values
        if (_rewardPeriod == 0) {
            revert ZeroValue();
        }

        serviceRegistry = _serviceRegistry;
        rewardPeriod = _rewardPeriod;

        owner = msg.sender;
    }

    /// @dev Changes contract owner address.
    /// @param newOwner Address of a new owner.
    function changeOwner(address newOwner) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check for zero address
        if (newOwner == address(0)) {
            revert ZeroAddress();
        }

        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    /// @dev Changes reward period.
    /// @param newRewardPeriod New reward period value.
    function changeRewardPeriod(uint256 newRewardPeriod) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check for zero value
        if (newRewardPeriod == 0) {
            revert ZeroAddress();
        }

        rewardPeriod = newRewardPeriod;
        emit RewardPeriodUpdated(newRewardPeriod);
    }

    /// @dev Registers service multisig for registration rewards.
    /// @param serviceId Service Id.
    /// @param stakingInstance Staking instance address.
    function registerMultisig(uint256 serviceId, address stakingInstance) external {
        // Reentrancy guard
        if (_locked == 2) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Get service multisig and state
        (, address multisig, , , , , IServiceRegistry.ServiceState serviceState) =
            IServiceRegistry(serviceRegistry).mapServices(serviceId);

        // Check for multisig address
        if (multisig == address(0)) {
            revert ZeroAddress();
        }

        // Check for service state
        if (serviceState != IServiceRegistry.ServiceState.Deployed) {
            revert WrongServiceState(serviceId, serviceState);
        }

        // Check for sender access
        if (msg.sender != multisig) {
            // Get service owner
            address serviceOwner = IServiceRegistry(serviceRegistry).ownerOf(serviceId);

            // Check for service owner
            if (msg.sender != serviceOwner) {
                revert UnauthorizedAccount(msg.sender);
            }
        }

        // Get service staking state
        IStaking.StakingState stakingState = IStaking(stakingInstance).getStakingState(serviceId);
        if (stakingState != IStaking.StakingState.Staked) {
            revert WrongStakingState(serviceId, stakingInstance, stakingState);
        }

        // Check for previous registration
        if (mapMultisigRegisteringTime[multisig] > 0) {
            revert AlreadyRegistered(multisig, serviceId);
        }
        mapMultisigRegisteringTime[multisig] = block.timestamp;

        emit ServiceMultisigRegistered(multisig, serviceId);

        _locked = 1;
    }

    /// @dev Checks for multisig reward eligibility.
    /// @param multisig Multisig address.
    function isStakingRewardEligible(address multisig) external view returns (bool) {
        // Get service multisig registration ts
        uint256 ts = mapMultisigRegisteringTime[multisig];

        // Check for multisig registration
        if (ts == 0) {
            return false;
        }

        // Eligibility counts from ts until ts + rewardPeriod
        return (block.timestamp >= ts + rewardPeriod);
    }
}