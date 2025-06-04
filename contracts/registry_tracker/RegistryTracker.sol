// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Staking interface
interface IStaking {
    // Service Info struct
    struct ServiceInfo {
        // Service multisig address
        address multisig;
        // Service owner
        address owner;
        // Service multisig nonces
        uint256[] nonces;
        // Staking start time
        uint256 tsStart;
        // Accumulated service staking reward
        uint256 reward;
        // Accumulated inactivity that might lead to the service eviction
        uint256 inactivity;
    }

    // Instance params struct
    struct InstanceParams {
        // Implementation of a created proxy instance
        address implementation;
        // Instance deployer
        address deployer;
        // Instance status flag
        bool isEnabled;
    }

    enum StakingState {
        Unstaked,
        Staked,
        Evicted
    }

    /// @dev Checkpoint to allocate rewards up until a current time.
    /// @return serviceIds Staking service Ids (excluding evicted ones within a current epoch).
    /// @return eligibleServiceIds Set of reward-eligible service Ids.
    /// @return eligibleServiceRewards Corresponding set of reward-eligible service rewards.
    /// @return evictServiceIds Evicted service Ids.
    function checkpoint() external returns (uint256[] memory serviceIds, uint256[] memory eligibleServiceIds,
        uint256[] memory eligibleServiceRewards, uint256[] memory evictServiceIds);

    /// @dev Gets staking service info.
    /// @param serviceId Service Id.
    function getServiceInfo(uint256 serviceId) external view returns(ServiceInfo memory);

    /// @dev Gets service registry address.
    function serviceRegistry() external view returns(address);

    /// @dev Gets activity checker address.
    function activityChecker() external view returns(address);

    /// @dev Gets the service staking state.
    /// @param serviceId.
    /// @return stakingState Staking state of the service.
    function getStakingState(uint256 serviceId) external view returns (StakingState stakingState);

    /// @dev Gets staking instance params.
    /// @param instance Staking instance address.
    function mapInstanceParams(address instance) external view returns(InstanceParams memory);
}

/// @dev Zero address.
error ZeroAddress();

/// @dev Zero value.
error ZeroValue();

/// @dev The contract is already initialized.
error AlreadyInitialized();

/// @dev Account is unauthorized.
/// @param account Account address.
error UnauthorizedAccount(address account);

/// @dev Service Id is already registered.
/// @param multisig Service multisig address.
/// @param serviceId Service Id.
error AlreadyRegistered(address multisig, uint256 serviceId);

/// @dev Wrong staking instance.
/// @param stakingInstance Staking instance address.
error WrongStakingInstance(address stakingInstance);

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
    event ImplementationUpdated(address indexed implementation);
    event RewardPeriodUpdated(uint256 rewardPeriod);
    event ActivityCheckerHashesWhitelisted(bytes32[] activityCheckerHashes);
    event ServiceMultisigRegistered(address indexed multisig, uint256 indexed serviceId);

    // Code position in storage is keccak256("REGISTRY_TRACKER_PROXY") = "0x74d7566dbc76da138d8eaf64f2774351bdfd8119d17c7d6332c2dc73d31d555a"
    bytes32 public constant REGISTRY_TRACKER_PROXY = 0x74d7566dbc76da138d8eaf64f2774351bdfd8119d17c7d6332c2dc73d31d555a;

    // Service registry address
    address public immutable serviceRegistry;
    // Staking factory address
    address public immutable stakingFactory;
    // Reward period in seconds
    uint256 public rewardPeriod;

    // Owner address
    address public owner;

    // Reentrancy lock
    uint256 internal _locked;

    // Mapping of service multisigs => timestamp of multisig registration
    mapping(address => uint256) public mapMultisigRegisteringTime;
    // Mapping of activity checker hash => whitelisted status
    mapping(bytes32 => bool) public mapActivityCheckerHashes;

    /// @dev RegistryTracker constructor.
    /// @param _serviceRegistry Service registry address.
    /// @param _stakingFactory Staking factory address.
    constructor(address _serviceRegistry, address _stakingFactory) {
        // Check for zero addresses
        if (_serviceRegistry == address(0) || _stakingFactory == address(0)) {
            revert ZeroAddress();
        }

        serviceRegistry = _serviceRegistry;
        stakingFactory = _stakingFactory;
    }

    /// @dev Initializes contract proxy.
    /// @param _rewardPeriod Reward period in seconds.
    function initialize(uint256 _rewardPeriod) external {
        // Check for already initialized
        if (owner != address(0)) {
            revert AlreadyInitialized();
        }

        // Check for zero value
        if (_rewardPeriod == 0) {
            revert ZeroValue();
        }

        rewardPeriod = _rewardPeriod;
        owner = msg.sender;

        _locked = 1;
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

    /// @dev Changes the contributors implementation contract address.
    /// @param newImplementation New implementation contract address.
    function changeImplementation(address newImplementation) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check for zero address
        if (newImplementation == address(0)) {
            revert ZeroAddress();
        }

        // Store the contributors implementation address
        assembly {
            sstore(REGISTRY_TRACKER_PROXY, newImplementation)
        }

        emit ImplementationUpdated(newImplementation);
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

    /// @dev Whitelists activity checker hashes.
    /// @notice Whitelisting is not reversible, since it is not desirable to drop support of whitelisted hashes.
    /// @param activityCheckerHashes Set of activity checker hashes.
    function whitelistActivityCheckerHashes(bytes32[] memory activityCheckerHashes) external {
        // Check the contract ownership
        if (owner != msg.sender) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Whitelist activity checker hashes
        for (uint256 i = 0; i < activityCheckerHashes.length; ++i) {
            // Check for zero values
            if (activityCheckerHashes[i] == 0) {
                revert ZeroValue();
            }

            mapActivityCheckerHashes[activityCheckerHashes[i]] = true;
        }

        emit ActivityCheckerHashesWhitelisted(activityCheckerHashes);
    }

    /// @dev Registers service multisig for registration rewards.
    /// @param serviceId Service Id.
    /// @param stakingInstance Staking instance address.
    function registerServiceMultisig(uint256 serviceId, address stakingInstance) external {
        // Reentrancy guard
        if (_locked == 2) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Get service multisig and owner
        IStaking.ServiceInfo memory serviceInfo = IStaking(stakingInstance).getServiceInfo(serviceId);

        // Check for multisig address
        if (serviceInfo.multisig == address(0)) {
            revert ZeroAddress();
        }

        // Check for sender access
        if (msg.sender != serviceInfo.multisig && msg.sender != serviceInfo.owner) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check for service registry address
        if (serviceRegistry != IStaking(stakingInstance).serviceRegistry()) {
            revert WrongStakingInstance(stakingInstance);
        }

        // Check for staking factory verification
        IStaking.InstanceParams memory instanceParams = IStaking(stakingFactory).mapInstanceParams(stakingInstance);
        if (instanceParams.implementation == address(0)) {
            revert WrongStakingInstance(stakingInstance);
        }

        // Get service staking state
        IStaking.StakingState stakingState = IStaking(stakingInstance).getStakingState(serviceId);
        if (stakingState != IStaking.StakingState.Staked) {
            revert WrongStakingState(serviceId, stakingInstance, stakingState);
        }

        // Get activity checker address
        address activityChecker = IStaking(stakingInstance).activityChecker();
        // Check that the activity checker address corresponds to the authorized bytecode hash
        bytes32 activityCheckerHash = keccak256(activityChecker.code);
        if (!mapActivityCheckerHashes[activityCheckerHash]) {
            revert WrongStakingInstance(stakingInstance);
        }

        // Check for previous registration
        if (mapMultisigRegisteringTime[serviceInfo.multisig] > 0) {
            revert AlreadyRegistered(serviceInfo.multisig, serviceId);
        }
        mapMultisigRegisteringTime[serviceInfo.multisig] = block.timestamp;

        // Call staking instance checkpoint
        IStaking(stakingInstance).checkpoint();

        emit ServiceMultisigRegistered(serviceInfo.multisig, serviceId);

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
        return (block.timestamp <= ts + rewardPeriod);
    }
}