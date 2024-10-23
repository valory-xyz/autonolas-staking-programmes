// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721TokenReceiver} from "../../lib/autonolas-registries/lib/solmate/src/tokens/ERC721.sol";
import {IContributors} from "./interfaces/IContributors.sol";
import {IService} from "./interfaces/IService.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {IToken} from "./interfaces/IToken.sol";

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

/// @dev Service is not defined for the social Id.
/// @param socialId Social Id.
error ServiceNotDefined(uint256 socialId);

/// @dev Wrong service owner.
/// @param serviceId Service Id.
/// @param sender Sender address.
/// @param serviceOwner Actual service owner.
error ServiceOwnerOnly(uint256 serviceId, address sender, address serviceOwner);

/// @title ContributeManager - Smart contract for managing services for contributors
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Tatiana Priemova - <tatiana.priemova@valory.xyz>
/// @author David Vilela - <david.vilelafreire@valory.xyz>
contract ContributeManager is ERC721TokenReceiver {
    event CreatedAndStaked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Staked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Unstaked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Claimed(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);

    // Number of agent instances
    uint256 public constant NUM_AGENT_INSTANCES = 1;
    // Threshold
    uint256 public constant THRESHOLD = 1;
    // Contributor agent Id
    uint256 public immutable agentId;
    // Contributor service config hash
    bytes32 public immutable configHash;
    // Contributors proxy address
    address public immutable contributorsProxy;
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
    // Safe multisig processing contract address
    address public immutable safeMultisig;
    // Safe fallback handler
    address public immutable fallbackHandler;

    // Nonce
    uint256 internal nonce;

    /// @dev ContributeManager constructor.
    /// @param _contributorsProxy Contributors proxy address.
    /// @param _serviceManager Service manager address.
    /// @param _olas OLAS token address.
    /// @param _stakingFactory Staking factory address.
    /// @param _safeMultisig Safe multisig address.
    /// @param _fallbackHandler Multisig fallback handler address.
    /// @param _agentId Contributor agent Id.
    /// @param _configHash Contributor service config hash.
    constructor(
        address _contributorsProxy,
        address _serviceManager,
        address _olas,
        address _stakingFactory,
        address _safeMultisig,
        address _fallbackHandler,
        uint256 _agentId,
        bytes32 _configHash
    ) {
        // Check for zero addresses
        if (_contributorsProxy == address(0) || _serviceManager == address(0) || _olas == address(0) ||
            _stakingFactory == address(0) || _safeMultisig == address(0) || _fallbackHandler == address(0)) {
            revert ZeroAddress();
        }

        // Check for zero values
        if (_agentId == 0 || _configHash == 0) {
            revert ZeroValue();
        }

        agentId = _agentId;
        configHash = _configHash;

        contributorsProxy = _contributorsProxy;
        serviceManager = _serviceManager;
        olas = _olas;
        stakingFactory = _stakingFactory;
        safeMultisig = _safeMultisig;
        fallbackHandler = _fallbackHandler;
        serviceRegistry = IService(serviceManager).serviceRegistry();
        serviceRegistryTokenUtility = IService(serviceManager).serviceRegistryTokenUtility();
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
        uint256 localNonce = nonce;
        uint256 randomNonce = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, localNonce)));
        bytes memory data = abi.encodePacked(address(0), fallbackHandler, address(0), address(0), uint256(0),
            randomNonce, "0x");
        // Deploy the service
        multisig = IService(serviceManager).deploy(serviceId, safeMultisig, data);

        // Update the nonce
        nonce = localNonce + 1;
    }

    /// @dev Stakes the already deployed service.
    /// @param socialId Social Id.
    /// @param serviceId Service Id.
    /// @param multisig Corresponding service multisig.
    /// @param stakingInstance Staking instance.
    function _stake(uint256 socialId, uint256 serviceId, address multisig, address stakingInstance) internal {
        // Add the service into its social Id corresponding record
        IContributors(contributorsProxy).setServiceInfoForId(msg.sender, socialId, serviceId, multisig, stakingInstance);

        // Approve service NFT for the staking instance
        IToken(serviceRegistry).approve(stakingInstance, serviceId);

        // Stake the service
        IStaking(stakingInstance).stake(serviceId);
    }

    /// @dev Creates and deploys a service for the contributor, and stakes it with a specified staking contract.
    /// @notice The service cannot be registered again if it is currently staked.
    /// @param socialId Contributor social Id.
    /// @param stakingInstance Contribute staking instance address.
    function createAndStake(uint256 socialId, address stakingInstance) external payable {
        // Check for zero value
        if (socialId == 0) {
            revert ZeroValue();
        }

        // Check for existing service corresponding to the msg.sender
        (, uint256 serviceId, address multisig, ) = IContributors(contributorsProxy).mapSocialIdServiceInfo(msg.sender);
        if (serviceId > 0) {
            revert ServiceAlreadyStaked(socialId, serviceId, multisig);
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
        (serviceId, multisig) = _createAndDeploy(olas, minStakingDeposit);

        // Stake the service
        _stake(socialId, serviceId, multisig, stakingInstance);

        emit CreatedAndStaked(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }

    /// @dev Stakes the already deployed service.
    /// @param socialId Social Id.
    /// @param serviceId Service Id.
    /// @param stakingInstance Staking instance.
    function stake(uint256 socialId, uint256 serviceId, address stakingInstance) external {
        // Check for existing service corresponding to the msg.sender
        (, uint256 serviceIdCheck, address multisig, ) = IContributors(contributorsProxy).mapSocialIdServiceInfo(msg.sender);
        if (serviceIdCheck > 0) {
            revert ServiceAlreadyStaked(socialId, serviceIdCheck, multisig);
        }

        // Get the service multisig
        (, multisig, , , , , ) = IService(serviceRegistry).mapServices(serviceId);

        // Check that the service multisig owner is msg.sender
        uint256 numAgentInstances = IStaking(stakingInstance).numAgentInstances();
        address[] memory multisigOwners = IMultisig(multisig).getOwners();
        if (multisigOwners.length != numAgentInstances || multisigOwners[0] != msg.sender) {
            revert WrongServiceSetup(socialId, serviceId, multisig);
        }

        // Transfer the service NFT
        IToken(serviceRegistry).transferFrom(msg.sender, address(this), serviceId);

        // Stake the service
        _stake(socialId, serviceId, multisig, stakingInstance);

        emit Staked(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }

    /// @dev Unstakes service Id corresponding to the msg.sender and clears the contributor record.
    function unstake() external {
        // Check for existing service corresponding to the social Id
        (uint256 socialId, uint256 serviceId, address multisig, address stakingInstance) =
            IContributors(contributorsProxy).mapSocialIdServiceInfo(msg.sender);
        if (serviceId == 0) {
            revert ServiceNotDefined(socialId);
        }

        // Unstake the service
        IStaking(stakingInstance).unstake(serviceId);

        // Transfer the service back to the original owner
        IToken(serviceRegistry).transfer(msg.sender, serviceId);

        // Zero the service info: the service is out of the contribute records, however multisig activity is still valid
        // If the same service is staked back, the multisig activity continues being tracked
        IContributors(contributorsProxy).setServiceInfoForId(msg.sender, 0, 0, address(0), address(0));

        emit Unstaked(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }

    /// @dev Claims rewards for the service corresponding to msg.sender.
    /// @return reward Staking reward.
    function claim() external returns (uint256 reward) {
        // Check for existing service corresponding to the social Id
        (uint256 socialId, uint256 serviceId, address multisig, address stakingInstance) =
            IContributors(contributorsProxy).mapSocialIdServiceInfo(msg.sender);
        if (serviceId == 0) {
            revert ServiceNotDefined(socialId);
        }

        // Claim staking rewards
        reward = IStaking(stakingInstance).claim(serviceId);

        emit Claimed(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }
}