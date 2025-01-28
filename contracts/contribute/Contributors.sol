// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721TokenReceiver} from "../../lib/autonolas-registries/lib/solmate/src/tokens/ERC721.sol";
import {IContributors} from "./interfaces/IContributors.sol";
import {IService} from "./interfaces/IService.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {IToken, INFToken} from "./interfaces/IToken.sol";

// Multisig interface
interface IMultisig {
    /// @dev Returns array of owners.
    /// @return Array of Safe owners.
    function getOwners() external view returns (address[] memory);
}

/// @dev Zero address.
error ZeroAddress();

/// @dev Zero value.
error ZeroValue();

/// @dev Only `owner` has a privilege, but the `sender` was provided.
/// @param sender Sender address.
/// @param owner Required sender address as an owner.
error OwnerOnly(address sender, address owner);

/// @dev The contract is already initialized.
error AlreadyInitialized();

/// @dev Wrong length of two arrays.
/// @param numValues1 Number of values in a first array.
/// @param numValues2 Number of values in a second array.
error WrongArrayLength(uint256 numValues1, uint256 numValues2);

/// @dev Account is unauthorized.
/// @param account Account address.
error UnauthorizedAccount(address account);

/// @dev Caught reentrancy violation.
error ReentrancyGuard();

/// @dev Service is already created and staked for the contributor.
/// @param socialId Social Id.
/// @param serviceId Service Id.
/// @param multisig Multisig address.
error ServiceAlreadyStaked(uint256 socialId, uint256 serviceId, address multisig);

/// @dev Wrong staking instance.
/// @param stakingInstance Staking instance address.
error WrongStakingInstance(address stakingInstance);

/// @dev Wrong provided service setup.
/// @param socialId Social Id.
/// @param serviceId Service Id.
/// @param multisig Multisig address.
error WrongServiceSetup(uint256 socialId, uint256 serviceId, address multisig);

/// @dev Wrong service state.
/// @param socialId Social Id.
/// @param serviceId Service Id.
/// @param state Service state.
error WrongServiceState(uint256 socialId, uint256 serviceId, IService.ServiceState state);

/// @dev Service is not defined for the social Id.
/// @param socialId Social Id.
error ServiceNotDefined(uint256 socialId);

/// @dev Wrong service owner.
/// @param serviceId Service Id.
/// @param sender Sender address.
/// @param serviceOwner Actual service owner.
error ServiceOwnerOnly(uint256 serviceId, address sender, address serviceOwner);

// Struct for service info
struct ServiceInfo {
    // Social Id
    uint256 socialId;
    // Service Id
    uint256 serviceId;
    // Corresponding service multisig
    address multisig;
    // Staking instance address
    address stakingInstance;
}

/// @title Contributors - Smart contract for managing contributors
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Tatiana Priemova - <tatiana.priemova@valory.xyz>
/// @author David Vilela - <david.vilelafreire@valory.xyz>
contract Contributors is ERC721TokenReceiver {
    event ImplementationUpdated(address indexed implementation);
    event OwnerUpdated(address indexed owner);
    event SetContributeServiceStatuses(address[] contributeServices, bool[] statuses);
    event MultisigActivityChanged(address indexed senderAgent, address[] multisigs, uint256[] activityChanges);
    event CreatedAndStaked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Staked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Unstaked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Restaked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Claimed(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event ServicePulled(address indexed sender, uint256 indexed serviceId);

    // Version number
    string public constant VERSION = "0.2.0";
    // Code position in storage is keccak256("CONTRIBUTORS_PROXY") = "0x8f33b4c48c4f3159dc130f2111086160da6c94439c147bd337ecee0aa81518c7"
    bytes32 public constant CONTRIBUTORS_PROXY = 0x8f33b4c48c4f3159dc130f2111086160da6c94439c147bd337ecee0aa81518c7;
    // Number of agent instances
    uint256 public constant NUM_AGENT_INSTANCES = 1;
    // Threshold
    uint256 public constant THRESHOLD = 1;
    // Contributor agent Id
    uint256 public immutable agentId;
    // Contributor service config hash
    bytes32 public immutable configHash;
    // Service manager address
    address public immutable serviceManager;
    // OLAS token address
    address public immutable olas;
    // Service registry address
    address public immutable serviceRegistry;
    // Service registry token utility address
    address public immutable serviceRegistryTokenUtility;
    // Staking factory address
    address public immutable stakingFactory;
    // TODO provide as input params where needed instead of setting state vars
    // Safe multisig processing contract address
    address public safeMultisig;
    // Safe same address multisig contract address
    address public safeSameAddressMultisig;
    // Safe fallback handler
    address public fallbackHandler;

    // Nonce
    uint256 internal _nonce;
    // Reentrancy lock
    uint256 internal _locked = 1;
    // Contract owner
    address public owner;

    // Mapping of account address => service info
    mapping(address => ServiceInfo) public mapAccountServiceInfo;
    // Mapping of service multisig address => activity
    mapping(address => uint256) public mapMutisigActivities;
    // Mapping of whitelisted contributor agents
    mapping(address => bool) public mapContributeAgents;

    /// @dev Contributors constructor.
    /// @param _serviceManager Service manager address.
    /// @param _olas OLAS token address.
    /// @param _stakingFactory Staking factory address.
    /// @param _agentId Contributor agent Id.
    /// @param _configHash Contributor service config hash.
    constructor(
        address _serviceManager,
        address _olas,
        address _stakingFactory,
        uint256 _agentId,
        bytes32 _configHash
    ) {
        // Check for zero addresses
        if (_serviceManager == address(0) || _olas == address(0) || _stakingFactory == address(0)) {
            revert ZeroAddress();
        }

        // Check for zero values
        if (_agentId == 0 || _configHash == 0) {
            revert ZeroValue();
        }

        agentId = _agentId;
        configHash = _configHash;

        serviceManager = _serviceManager;
        olas = _olas;
        stakingFactory = _stakingFactory;
        serviceRegistry = IService(serviceManager).serviceRegistry();
        serviceRegistryTokenUtility = IService(serviceManager).serviceRegistryTokenUtility();
    }

    // TODO provide as input params where needed instead of setting state vars
    /// @dev Contributors initializer.
    /// @param _safeMultisig Safe multisig contract address.
    /// @param _safeSameAddressMultisig Safe same address multisig contract address.
    /// @param _fallbackHandler Multisig fallback handler address.
    function initialize(address _safeMultisig, address _safeSameAddressMultisig, address _fallbackHandler) external {
        // Check for already initialized
        if (owner != address(0)) {
            revert AlreadyInitialized();
        }

        // Check for zero addresses
        if (_safeMultisig == address(0) || _safeSameAddressMultisig == address(0) || _fallbackHandler == address(0)) {
            revert ZeroAddress();
        }

        safeMultisig = _safeMultisig;
        safeSameAddressMultisig = _safeSameAddressMultisig;
        fallbackHandler = _fallbackHandler;

        owner = msg.sender;
    }

    /// @dev Changes the contributors implementation contract address.
    /// @param newImplementation New implementation contract address.
    function changeImplementation(address newImplementation) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for zero address
        if (newImplementation == address(0)) {
            revert ZeroAddress();
        }

        // Store the contributors implementation address
        assembly {
            sstore(CONTRIBUTORS_PROXY, newImplementation)
        }

        emit ImplementationUpdated(newImplementation);
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

    /// @dev Sets contribute service multisig statues.
    /// @param contributeServices Contribute service multisig addresses.
    /// @param statuses Corresponding whitelisting statues.
    function setContributeServiceStatuses(address[] memory contributeServices, bool[] memory statuses) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for array lengths
        if (contributeServices.length == 0 || contributeServices.length != statuses.length) {
            revert WrongArrayLength(contributeServices.length, statuses.length);
        }

        // Traverse all contribute service multisigs and statuses
        for (uint256 i = 0; i < contributeServices.length; ++i) {
            // Check for zero addresses
            if (contributeServices[i] == address(0)) {
                revert ZeroAddress();
            }

            mapContributeAgents[contributeServices[i]] = statuses[i];
        }

        emit SetContributeServiceStatuses(contributeServices, statuses);
    }

    /// @dev Increases multisig activity by the contribute service.
    /// @param multisigs Multisig addresses.
    /// @param activityChanges Corresponding activity changes
    function increaseActivity(address[] memory multisigs, uint256[] memory activityChanges) external {
        // Check for whitelisted contribute agent
        if (!mapContributeAgents[msg.sender]) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check for array lengths
        if (multisigs.length == 0 || multisigs.length != activityChanges.length) {
            revert WrongArrayLength(multisigs.length, activityChanges.length);
        }

        // Increase / decrease multisig activity
        for (uint256 i = 0; i < multisigs.length; ++i) {
            mapMutisigActivities[multisigs[i]] += activityChanges[i];
        }

        emit MultisigActivityChanged(msg.sender, multisigs, activityChanges);
    }

    /// @dev Creates and deploys a service for the contributor.
    /// @param token Staking token address.
    /// @param minStakingDeposit Min staking deposit value.
    /// @return serviceId Minted service Id.
    /// @return multisig Service multisig.
    function _createAndDeploy(
        address token,
        uint256 minStakingDeposit
    ) internal returns (uint256 serviceId, address multisig) {
        // Set agent params
        IService.AgentParams[] memory agentParams = new IService.AgentParams[](NUM_AGENT_INSTANCES);
        agentParams[0] = IService.AgentParams(uint32(NUM_AGENT_INSTANCES), uint96(minStakingDeposit));

        // Set agent Ids
        uint32[] memory agentIds = new uint32[](NUM_AGENT_INSTANCES);
        agentIds[0] = uint32(agentId);

        // Set agent instances as [msg.sender]
        address[] memory instances = new address[](NUM_AGENT_INSTANCES);
        instances[0] = msg.sender;

        // Create a service owned by this contract
        serviceId = IService(serviceManager).create(address(this), token, configHash, agentIds,
            agentParams, uint32(THRESHOLD));

        // Activate registration (1 wei as a deposit wrapper)
        IService(serviceManager).activateRegistration{value: 1}(serviceId);

        // Register msg.sender as an agent instance (numAgentInstances wei as a bond wrapper)
        IService(serviceManager).registerAgents{value: NUM_AGENT_INSTANCES}(serviceId, instances, agentIds);

        // Prepare Safe multisig data
        uint256 localNonce = _nonce;
        uint256 randomNonce = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, localNonce)));
        bytes memory data = abi.encodePacked(address(0), fallbackHandler, address(0), address(0), uint256(0),
            randomNonce, "0x");
        // Deploy the service
        multisig = IService(serviceManager).deploy(serviceId, safeMultisig, data);

        // Update the nonce
        _nonce = localNonce + 1;
    }

    function _reDeploy(uint256 serviceId, address stakingInstance, address multisig, bool updateService) internal {
        // Get deposit service info for staking
        uint256 minStakingDeposit = IStaking(stakingInstance).minStakingDeposit();

        // Set agent Ids
        uint32[] memory agentIds = new uint32[](NUM_AGENT_INSTANCES);
        agentIds[0] = uint32(agentId);

        if (updateService) {
            address token = IStaking(stakingInstance).stakingToken();
            // Set agent params
            IService.AgentParams[] memory agentParams = new IService.AgentParams[](NUM_AGENT_INSTANCES);
            agentParams[0] = IService.AgentParams(uint32(NUM_AGENT_INSTANCES), uint96(minStakingDeposit));
            // Update service
            IService(serviceManager).update(token, configHash, agentIds, agentParams, uint32(THRESHOLD), serviceId);
        }

        // Calculate the total bond required for the service deployment:
        uint256 totalBond = (1 + NUM_AGENT_INSTANCES) * minStakingDeposit;

        // Transfer the total bond amount from the contributor
        IToken(olas).transferFrom(msg.sender, address(this), totalBond);
        // Approve token for the serviceRegistryTokenUtility contract
        IToken(olas).approve(serviceRegistryTokenUtility, totalBond);

        // Set agent instances as [msg.sender]
        address[] memory instances = new address[](NUM_AGENT_INSTANCES);
        instances[0] = msg.sender;

        // Activate registration (1 wei as a deposit wrapper)
        IService(serviceManager).activateRegistration{value: 1}(serviceId);

        // Register msg.sender as an agent instance (numAgentInstances wei as a bond wrapper)
        IService(serviceManager).registerAgents{value: NUM_AGENT_INSTANCES}(serviceId, instances, agentIds);

        // Prepare re-deployment payload
        bytes memory data = abi.encodePacked(multisig);
        // Re-deploy service
        IService(serviceManager).deploy(serviceId, safeSameAddressMultisig, data);
    }

    /// @dev Stakes the already deployed service.
    /// @param socialId Social Id.
    /// @param serviceId Service Id.
    /// @param multisig Corresponding service multisig.
    /// @param stakingInstance Staking instance.
    function _stake(uint256 socialId, uint256 serviceId, address multisig, address stakingInstance) internal {
        // Add the service into its social Id corresponding record
        mapAccountServiceInfo[msg.sender] = ServiceInfo(socialId, serviceId, multisig, stakingInstance);

        // Approve service NFT for the staking instance
        INFToken(serviceRegistry).approve(stakingInstance, serviceId);

        // Stake the service
        IStaking(stakingInstance).stake(serviceId);
    }

    /// @dev Creates and deploys a service for the contributor, and stakes it with a specified staking contract.
    /// @notice The service cannot be registered again if it is currently staked.
    /// @param socialId Contributor social Id.
    /// @param stakingInstance Contribute staking instance address.
    function createAndStake(uint256 socialId, address stakingInstance) external payable {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Check for zero value
        if (socialId == 0) {
            revert ZeroValue();
        }

        // Check for existing service corresponding to the msg.sender
        ServiceInfo storage serviceInfo = mapAccountServiceInfo[msg.sender];
        if (serviceInfo.multisig != address(0)) {
            revert ServiceAlreadyStaked(socialId, serviceInfo.serviceId, serviceInfo.multisig);
        }

        // Check for staking instance validity
        if(!IStaking(stakingFactory).verifyInstance(stakingInstance)) {
            revert WrongStakingInstance(stakingInstance);
        }

        // Get the token info from the staking contract
        // If this call fails, it means the staking contract does not have a token and is not compatible
        address token = IStaking(stakingInstance).stakingToken();
        // Check the token address
        if (token != olas) {
            revert WrongStakingInstance(stakingInstance);
        }

        // Get other service info for staking
        uint256 minStakingDeposit = IStaking(stakingInstance).minStakingDeposit();
        uint256 numAgentInstances = IStaking(stakingInstance).numAgentInstances();
        uint256 threshold = IStaking(stakingInstance).threshold();
        // Check for number of agent instances that must be equal to one,
        // since msg.sender is the only service multisig owner
        if ((numAgentInstances > 0 &&  numAgentInstances != NUM_AGENT_INSTANCES) ||
            (threshold > 0 && threshold != THRESHOLD)) {
            revert WrongStakingInstance(stakingInstance);
        }

        // Calculate the total bond required for the service deployment:
        uint256 totalBond = (1 + NUM_AGENT_INSTANCES) * minStakingDeposit;

        // Transfer the total bond amount from the contributor
        IToken(olas).transferFrom(msg.sender, address(this), totalBond);
        // Approve token for the serviceRegistryTokenUtility contract
        IToken(olas).approve(serviceRegistryTokenUtility, totalBond);

        // Create and deploy service
        (uint256 serviceId, address multisig) = _createAndDeploy(olas, minStakingDeposit);

        // Stake the service
        _stake(socialId, serviceId, multisig, stakingInstance);

        emit CreatedAndStaked(socialId, msg.sender, serviceId, multisig, stakingInstance);

        _locked = 1;
    }

    /// @dev Stakes the already deployed service.
    /// @param socialId Social Id.
    /// @param serviceId Service Id.
    /// @param stakingInstance Staking instance.
    function stake(uint256 socialId, uint256 serviceId, address stakingInstance) external payable {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Check for existing service corresponding to the msg.sender
        ServiceInfo storage serviceInfo = mapAccountServiceInfo[msg.sender];
        if (serviceInfo.multisig != address(0)) {
            revert ServiceAlreadyStaked(socialId, serviceInfo.serviceId, serviceInfo.multisig);
        }

        // Get the service multisig
        (, address multisig, , , , , IService.ServiceState state) = IService(serviceRegistry).mapServices(serviceId);

        // Check that the service multisig owner is msg.sender
        uint256 numAgentInstances = IStaking(stakingInstance).numAgentInstances();
        address[] memory multisigOwners = IMultisig(multisig).getOwners();
        if (multisigOwners.length != numAgentInstances || multisigOwners[0] != msg.sender) {
            revert WrongServiceSetup(socialId, serviceId, multisig);
        }

        // Transfer the service NFT, if owned by contributor
        address serviceOwner = INFToken(serviceRegistry).ownerOf(serviceId);
        if (serviceOwner != address(this)) {
            INFToken(serviceRegistry).safeTransferFrom(msg.sender, address(this), serviceId);
        }

        // Check for pre-registration or deployed service state
        if (state == IService.ServiceState.PreRegistration) {
            // If pre-registration - re-deploy service first
            _reDeploy(serviceId, stakingInstance, multisig, false);
        } else if (state != IService.ServiceState.Deployed) {
            revert WrongServiceState(socialId, serviceId, state);
        }

        // Stake the service
        _stake(socialId, serviceId, multisig, stakingInstance);

        emit Staked(socialId, msg.sender, serviceId, multisig, stakingInstance);

        _locked = 1;
    }

    /// @dev Unstakes service Id corresponding to the msg.sender and clears the contributor record.
    function unstake(bool pullService) external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Check for existing service corresponding to the social Id
        ServiceInfo memory serviceInfo = mapAccountServiceInfo[msg.sender];
        if (serviceInfo.serviceId == 0) {
            revert ServiceNotDefined(serviceInfo.socialId);
        }

        _unstake(serviceInfo.socialId, serviceInfo.serviceId, serviceInfo.multisig, serviceInfo.stakingInstance, pullService);

        _locked = 1;
    }

    /// @dev Unstakes service Id corresponding to the msg.sender and clears the contributor record.
    function _unstake(
        uint256 socialId,
        uint256 serviceId,
        address multisig,
        address stakingInstance,
        bool pullService
    ) internal {
        // Unstake the service
        IStaking(stakingInstance).unstake(serviceId);

        // Terminate service
        (, uint256 refund) = IService(serviceManager).terminate(serviceId);
        uint256 refundNative = 1;

        // Unbond service, if operator is address(this)
        if (IService(serviceRegistry).mapAgentInstanceOperators(msg.sender) == address(this)) {
            (, uint256 unbondAmount) = IService(serviceManager).unbond(serviceId);
            refund += unbondAmount;
            refundNative += NUM_AGENT_INSTANCES;
        }

        // Transfer back OLAS tokens
        IToken(olas).transfer(msg.sender, refund);

        // Transfer back cover deposit
        msg.sender.call{value: refundNative}("");

        // Transfer the service back to the original owner, if requested
        if (pullService) {
            INFToken(serviceRegistry).transferFrom(address(this), msg.sender, serviceId);

            // Zero the service info: the service is out of the contribute records, however multisig activity is still valid
            // If the same service is staked back, the multisig activity continues being tracked
            delete mapAccountServiceInfo[msg.sender];
        } else {
            // Partially remove contribute records, such that the service could be pulled later
            mapAccountServiceInfo[msg.sender].multisig = address(0);
            mapAccountServiceInfo[msg.sender].stakingInstance = address(0);
        }

        emit Unstaked(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }

    /// @dev Re-stakes evicted service Id corresponding to the msg.sender or from one staking instance to another.
    /// @notice Service is unstaked, terminated, unbonded, and current service stake is returned to the contributor.
    ///         Thus, make sure to approve a new stake amount in order to be able to re-deploy the service and stake it.
    ///         If service staking addresses match, service must be evicted to be re-staked.
    /// @param nextStakingInstance Staking instance address to re-stake to.
    function reStake(address nextStakingInstance) external payable {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Check for existing service corresponding to the social Id
        ServiceInfo memory serviceInfo = mapAccountServiceInfo[msg.sender];
        if (serviceInfo.serviceId == 0) {
            revert ServiceNotDefined(serviceInfo.socialId);
        }

        // If service staking addresses match, re-staked the service
        if (serviceInfo.stakingInstance == nextStakingInstance) {
            // Check that the service is evicted
            if (IStaking(serviceInfo.stakingInstance).getStakingState(serviceInfo.serviceId) != IStaking.StakingState.Evicted) {
                revert ServiceAlreadyStaked(serviceInfo.socialId, serviceInfo.serviceId, serviceInfo.multisig);
            }

            // Unstake the service
            IStaking(serviceInfo.stakingInstance).unstake(serviceInfo.serviceId);

            // Approve service NFT for the staking instance
            INFToken(serviceRegistry).approve(serviceInfo.stakingInstance, serviceInfo.serviceId);

            // Stake the service
            IStaking(serviceInfo.stakingInstance).stake(serviceInfo.serviceId);
        } else {
            // Otherwise re-stake to a specified staking instance
            // Unstake the service, terminate, unbond, but keep in CM possession
            _unstake(serviceInfo.socialId, serviceInfo.serviceId, serviceInfo.multisig, serviceInfo.stakingInstance, false);

            // Re-deploy the service
            _reDeploy(serviceInfo.serviceId, nextStakingInstance, serviceInfo.multisig, true);

            // Approve service NFT for the next staking instance
            INFToken(serviceRegistry).approve(nextStakingInstance, serviceInfo.serviceId);

            // Stake the service
            IStaking(nextStakingInstance).stake(serviceInfo.serviceId);

            // Record the multisig value again, as it was deleted during the _unstake()
            mapAccountServiceInfo[msg.sender].multisig = serviceInfo.multisig;
            // Change contributor staking instance
            mapAccountServiceInfo[msg.sender].stakingInstance = nextStakingInstance;
        }

        emit Restaked(serviceInfo.socialId, msg.sender, serviceInfo.serviceId, serviceInfo.multisig, nextStakingInstance);

        _locked = 1;
    }

    /// @dev Claims rewards for the service corresponding to msg.sender.
    /// @return reward Staking reward.
    function claim() external returns (uint256 reward) {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Check for existing service corresponding to the social Id
        ServiceInfo memory serviceInfo = mapAccountServiceInfo[msg.sender];
        if (serviceInfo.serviceId == 0) {
            revert ServiceNotDefined(serviceInfo.socialId);
        }

        // Claim staking rewards
        reward = IStaking(serviceInfo.stakingInstance).claim(serviceInfo.serviceId);

        emit Claimed(serviceInfo.socialId, msg.sender, serviceInfo.serviceId, serviceInfo.multisig,
            serviceInfo.stakingInstance);

        _locked = 1;
    }

    /// @dev Pulls unbonded service by contributor.
    function pullUnbondedService() external {
        // Check for existing service corresponding to the social Id
        ServiceInfo storage serviceInfo = mapAccountServiceInfo[msg.sender];
        if (serviceInfo.serviceId == 0) {
            revert ServiceNotDefined(serviceInfo.socialId);
        }

        // Check that the multisig record is cleared
        if (serviceInfo.multisig != address(0)) {
            revert WrongServiceSetup(serviceInfo.socialId, serviceInfo.serviceId, serviceInfo.multisig);
        }

        // Transfer the service back to the original owner
        INFToken(serviceRegistry).transferFrom(address(this), msg.sender, serviceInfo.serviceId);

        // Clear contributor records completely
        delete mapAccountServiceInfo[msg.sender];

        emit ServicePulled(msg.sender, serviceInfo.serviceId);
    }

    receive() external payable {}
}