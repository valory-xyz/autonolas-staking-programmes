// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IService} from "./interfaces/IService.sol";

// Contributors interface
interface IContributors {
    /// @dev Sets service info for the social id.
    /// @param socialId Social id.
    /// @param serviceId Service Id.
    /// @param multisig Service multisig address.
    /// @param stakingInstance Staking instance address.
    /// @param serviceOwner Service owner.
    function setServiceInfoForId(
        uint256 socialId,
        uint256 serviceId,
        address multisig,
        address stakingInstance,
        address serviceOwner
    ) external;

    /// @dev Gets service info corresponding to a specified social Id.
    /// @param socialId Social Id.
    /// @return serviceId Corresponding service Id.
    /// @return multisig Corresponding service multisig.
    /// @return stakingInstance Staking instance address.
    /// @return serviceOwner Service owner.
    function mapSocialIdServiceInfo(uint256 socialId) external view
        returns (uint256 serviceId, address multisig, address stakingInstance, address serviceOwner);
}

// Staking interface
interface IStaking {
    /// @dev Gets service staking token.
    /// @return Service staking token address.
    function stakingToken() external view returns (address);

    /// @dev Gets minimum service staking deposit value required for staking.
    /// @return Minimum service staking deposit.
    function minStakingDeposit() external view returns (uint256);

    /// @dev Gets number of required agent instances in the service.
    /// @return Number of agent instances.
    function numAgentInstances() external view returns (uint256);

    /// @dev Gets the service threshold.
    /// @return Threshold.
    function threshold() external view returns (uint256);

    /// @dev Stakes the service.
    /// @param serviceId Service Id.
    function stake(uint256 serviceId) external;

    /// @dev Unstakes the service with collected reward, if available.
    /// @param serviceId Service Id.
    /// @return reward Staking reward.
    function unstake(uint256 serviceId) external returns (uint256);

    /// @dev Claims rewards for the service without an additional checkpoint call.
    /// @param serviceId Service Id.
    /// @return Staking reward.
    function claim(uint256 serviceId) external returns (uint256);
}

// Token interface
interface IToken {
    /// @dev Transfers the token amount.
    /// @param to Address to transfer to.
    /// @param amount The amount to transfer.
    /// @return True if the function execution is successful.
    function transfer(address to, uint256 amount) external returns (bool);

    /// @dev Transfers the token amount that was previously approved up until the maximum allowance.
    /// @param from Account address to transfer from.
    /// @param to Account address to transfer to.
    /// @param amount Amount to transfer to.
    /// @return True if the function execution is successful.
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    /// @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
    /// @param spender Account address that will be able to transfer tokens on behalf of the caller.
    /// @param amount Token amount.
    /// @return True if the function execution is successful.
    function approve(address spender, uint256 amount) external returns (bool);
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

/// @dev Service is not defined for the social Id.
/// @param socialId Social Id.
error ServiceNotDefined(uint256 socialId);

/// @dev Wrong service owner.
/// @param serviceId Service Id.
/// @param sender Sender address.
/// @param serviceOwner Actual service owner.
error ServiceOwnerOnly(uint256 serviceId, address sender, address serviceOwner);

/// @title ContributeServiceManager - Smart contract for managing services for contributors
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Tatiana Priemova - <tatiana.priemova@valory.xyz>
/// @author David Vilela - <david.vilelafreire@valory.xyz>
contract ContributeServiceManager {
    event CreatedAndStaked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Staked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Unstaked(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);
    event Claimed(uint256 indexed socialId, address indexed serviceOwner, uint256 serviceId,
        address indexed multisig, address stakingInstance);

    // Contribute agent Id
    uint256 public constant AGENT_ID = 6;
    // Contributor service config hash mock
    bytes32 public constant CONFIG_HASH = 0x0000000000000000000000000000000000000000000000000000000000000006;
    // Contributors proxy contract address
    address public immutable contributorsProxy;
    // Service manager contract address
    address public immutable serviceManager;
    // Service registry address
    address public immutable serviceRegistry;
    // Service registry token utility address
    address public immutable serviceRegistryTokenUtility;
    // Safe multisig processing contract address
    address public immutable safeMultisig;
    // Safe fallback handler
    address public immutable fallbackHandler;

    /// @dev ContributeServiceManager constructor.
    /// @param _contributorsProxy Contributors proxy address.
    /// @param _serviceManager Service manager address.
    /// @param _safeMultisig Safe multisig address.
    /// @param _fallbackHandler Multisig fallback handler address.
    constructor(address _contributorsProxy, address _serviceManager, address _safeMultisig, address _fallbackHandler) {
        // Check the zero address
        if (_contributorsProxy == address(0) || _serviceManager == address(0) || _safeMultisig == address(0) ||
            _fallbackHandler == address(0)) {
            revert ZeroAddress();
        }

        contributorsProxy = _contributorsProxy;
        serviceManager = _serviceManager;
        safeMultisig = _safeMultisig;
        fallbackHandler = _fallbackHandler;
        serviceRegistry = IService(serviceManager).serviceRegistry();
        serviceRegistryTokenUtility = IService(serviceManager).serviceRegistryTokenUtility();
    }

    function _createAndDeploy(
        address token,
        uint256 minStakingDeposit,
        uint256 numAgentInstances,
        uint256 threshold
    ) internal returns (uint256 serviceId, address multisig) {
        // Set agent params
        IService.AgentParams[] memory agentParams = new IService.AgentParams[](1);
        agentParams[0] = IService.AgentParams(uint32(numAgentInstances), uint96(minStakingDeposit));

        // Set agent Ids
        uint32[] memory agentIds = new uint32[](1);
        agentIds[0] = uint32(AGENT_ID);

        // Set agent instances as [msg.sender]
        address[] memory instances = new address[](1);
        instances[0] = msg.sender;

        // Create a service owned by this contract
        serviceId = IService(serviceManager).create(address(this), token, CONFIG_HASH, agentIds,
            agentParams, uint32(threshold));

        // Activate registration (1 wei as a deposit wrapper)
        IService(serviceManager).activateRegistration{value: 1}(serviceId);

        // Register msg.sender as an agent instance (numAgentInstances wei as a bond wrapper)
        IService(serviceManager).registerAgents{value: numAgentInstances}(serviceId, instances, agentIds);

        // Deploy the service
        // TODO: fix the data
        multisig = IService(serviceManager).deploy(serviceId, safeMultisig, "0x");
    }

    /// @dev Creates and deploys a service for the contributor, and stakes it with a specified staking contract.
    /// @notice The service cannot be registered again if it is currently staked.
    /// @param socialId Contributor social Id.
    /// @param stakingInstance Contribute staking instance address.
    function createAndStake(uint256 socialId, address stakingInstance) external payable {
        // Check for existing service corresponding to the social Id
        (uint256 serviceId, address multisig, , ) = IContributors(contributorsProxy).mapSocialIdServiceInfo(socialId);
        if (serviceId > 0) {
            revert ServiceAlreadyStaked(socialId, serviceId, multisig);
        }

        // Get the token info from the staking contract
        // If this call fails, it means the staking contract does not have a token and is not compatible
        address token = IStaking(stakingInstance).stakingToken();
//        // This way allows not to revert when the staking contract does not have a token (native token based)
//        bytes memory tokenData = abi.encodeCall(IStaking.stakingToken, ());
//        (success, returnData) = instance.staticcall(tokenData);
//
//        // Check the returnData is the call was successful
//        if (success) {
//            // The returned size must be 32 to fit one address
//            if (returnData.length == 32) {
//                token = abi.decode(returnData, (address));
//                if (token != olas) {
//                    return false;
//                }
//            } else {
//                revert();
//            }
//        }

        // Get other service info for staking
        uint256 minStakingDeposit = IStaking(stakingInstance).minStakingDeposit();
        uint256 numAgentInstances = IStaking(stakingInstance).numAgentInstances();
        uint256 threshold = IStaking(stakingInstance).threshold();
        // Check for number of agent instances that must be equal to one,
        // since msg.sender is the only service multisig owner
        if (numAgentInstances != 1 || threshold != 1) {
            revert WrongStakingInstance(stakingInstance);
        }

        // Calculate the total bond required for the service deployment:
        uint256 totalBond = (1 + numAgentInstances) * minStakingDeposit;

        // Transfer the total bond amount from the contributor
        IToken(token).transferFrom(msg.sender, address(this), totalBond);
        // Approve token for the serviceRegistryTokenUtility contract
        IToken(token).approve(serviceRegistryTokenUtility, totalBond);

        // Create and deploy service
        (serviceId, multisig) = _createAndDeploy(token, minStakingDeposit, numAgentInstances, threshold);

        // Stake the service
        _stake(socialId, serviceId, multisig, stakingInstance);

        emit CreatedAndStaked(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }

    function _stake(uint256 socialId, uint256 serviceId, address multisig, address stakingInstance) public {
        // Add the service into its social Id corresponding record
        IContributors(contributorsProxy).setServiceInfoForId(socialId, serviceId, multisig, stakingInstance, msg.sender);

        // Stake the service
        IStaking(stakingInstance).stake(serviceId);
    }

    /// @dev Stakes the already deployed service.
    function stake(uint256 socialId, uint256 serviceId, address stakingInstance) public {
        // Check for existing service corresponding to the social Id
        (uint256 serviceIdCheck, address multisig, , ) = IContributors(contributorsProxy).mapSocialIdServiceInfo(socialId);
        if (serviceIdCheck > 0) {
            revert ServiceAlreadyStaked(socialId, serviceIdCheck, multisig);
        }

        // Transfer the service NFT
        IToken(serviceRegistry).transferFrom(msg.sender, address(this), serviceId);

        // Approve service NFT for the staking instance
        IToken(serviceRegistry).approve(stakingInstance, serviceId);

        // Get the service multisig
        (, multisig, , , , , ) = IService(serviceRegistry).mapServices(serviceId);

        // Stake the service
        _stake(socialId, serviceId, multisig, stakingInstance);

        emit Staked(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }

    function unstake(uint256 socialId) external {
        // Check for existing service corresponding to the social Id
        (uint256 serviceId, address multisig, address stakingInstance, address serviceOwner) =
            IContributors(contributorsProxy).mapSocialIdServiceInfo(socialId);
        if (serviceId == 0) {
            revert ServiceNotDefined(socialId);
        }

        // Check for service owner
        if (msg.sender != serviceOwner) {
            revert ServiceOwnerOnly(serviceId, msg.sender, serviceOwner);
        }

        // Unstake the service
        IStaking(stakingInstance).unstake(serviceId);

        // Transfer the service back to the original owner
        IToken(serviceRegistry).transfer(serviceOwner, serviceId);

        // Zero the service info: the service is out of the contribute records, however multisig activity is still valid
        // If the same service is staked back, the multisig activity continues being tracked
        IContributors(contributorsProxy).setServiceInfoForId(socialId, 0, address(0), address(0), address(0));

        emit Unstaked(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }

    function claim(uint256 socialId) external {
        // Check for existing service corresponding to the social Id
        (uint256 serviceId, address multisig, address stakingInstance, address serviceOwner) =
            IContributors(contributorsProxy).mapSocialIdServiceInfo(socialId);
        if (serviceId == 0) {
            revert ServiceNotDefined(socialId);
        }

        // Check for service owner
        if (msg.sender != serviceOwner) {
            revert ServiceOwnerOnly(serviceId, msg.sender, serviceOwner);
        }

        // Claim staking rewards
        IStaking(stakingInstance).claim(serviceId);

        emit Claimed(socialId, msg.sender, serviceId, multisig, stakingInstance);
    }
}