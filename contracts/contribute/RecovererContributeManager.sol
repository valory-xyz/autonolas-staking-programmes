// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IService} from "./interfaces/IService.sol";
import {IToken, INFToken} from "./interfaces/IToken.sol";

// Multisig interface
interface IMultisig {
    /// @dev Returns array of owners.
    /// @return Array of Safe owners.
    function getOwners() external view returns (address[] memory);
}

/// @dev Only `owner` has a privilege, but the `sender` was provided.
/// @param sender Sender address.
/// @param owner Required sender address as an owner.
error OwnerOnly(address sender, address owner);

/// @dev Refund has been already processed.
/// @param account Account address
error AlreadyRefunded(address account);

/// @dev Zero address.
error ZeroAddress();

/// @dev Account is unauthorized.
/// @param account Account address.
error UnauthorizedAccount(address account);

/// @dev Wrong service state.
/// @param serviceId Service Id.
/// @param state Service state.
error WrongServiceState(uint256 serviceId, IService.ServiceState state);

/// @dev Service is not slashed.
/// @param serviceId Service Id.
error ServiceNotSlashed(uint256 serviceId);

/// @title RecovererContributeManager - Smart contract for recovery contribute manager funds
contract RecovererContributeManager {
    event Refunded(address indexed account, uint256 amount);

    // Version number
    string public constant VERSION = "0.1.0";

    // OLAS token address
    address public immutable olas;
    // Contribute manager contract address
    address public immutable contributeManager;
    // Service registry
    address public immutable serviceRegistry;
    // Service registry token utility
    address public immutable serviceRegistryTokenUtility;

    // Map of account address => refund processed
    mapping(address => bool) public mapAccountRefunds;

    constructor(
        address _olas,
        address _contributeManager,
        address _serviceRegistry,
        address _serviceRegistryTokenUtility
    ) {
        olas = _olas;
        contributeManager = _contributeManager;
        serviceRegistry = _serviceRegistry;
        serviceRegistryTokenUtility = _serviceRegistryTokenUtility;
    }

    /// @notice The service must be unstaked from ContributorManager and terminated.
    function recover(uint256 serviceId) external {
        // Check if the refund was already made
        if (mapAccountRefunds[msg.sender]) {
            revert AlreadyRefunded(msg.sender);
        }

        // Check ownership
        address serviceOwner = INFToken(serviceRegistry).ownerOf(serviceId);
        if (msg.sender != serviceOwner) {
            revert OwnerOnly(msg.sender, serviceOwner);
        }

        // Check the multisig ownership
        // Get the service multisig
        (uint96 securityDeposit, address multisig, , , , uint32 numAgentInstances, IService.ServiceState state) =
            IService(serviceRegistry).mapServices(serviceId);

        // Check that the state is TerminatedBonded
        if (state != IService.ServiceState.TerminatedBonded) {
            revert WrongServiceState(serviceId, state);
        }

        // Check that the service multisig owner is msg.sender
        address[] memory multisigOwners = IMultisig(multisig).getOwners();
        if (multisigOwners.length != numAgentInstances || multisigOwners[0] != msg.sender) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check that contribute manager is the operator
        address operator = IService(serviceRegistry).mapAgentInstanceOperators(msg.sender);
        if (operator != contributeManager) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Push a pair of key defining variables into one key. Service Id or operator are not enough by themselves
        // operator occupies first 160 bits
        uint256 operatorService = uint256(uint160(contributeManager));
        // serviceId occupies next 32 bits
        operatorService |= serviceId << 160;

        // Check that operator balance has been slashed
        if (IService(serviceRegistryTokenUtility).mapOperatorAndServiceIdOperatorBalances(operatorService) != 0) {
            revert ServiceNotSlashed(serviceId);
        }

        // Record refund has been made
        mapAccountRefunds[msg.sender] = true;

        // Refund
        IToken(olas).transfer(msg.sender, securityDeposit);

        emit Refunded(msg.sender, securityDeposit);
    }
}