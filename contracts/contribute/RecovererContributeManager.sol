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

/// @dev Zero value.
error ZeroValue();

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
    event OwnerUpdated(address indexed owner);
    event Refunded(address indexed account, uint256 amount);
    event Drained(address indexed drainer, uint256 amount);

    // Version number
    string public constant VERSION = "0.1.0";

    // Refund factor in 1e18 format
    uint256 public immutable refundFactor;
    // OLAS token address
    address public immutable olas;
    // Contribute manager contract address
    address public immutable contributeManager;
    // Service registry
    address public immutable serviceRegistry;
    // Service registry token utility
    address public immutable serviceRegistryTokenUtility;
    // Drainer address
    address public immutable drainer;

    // Owner address
    address public owner;

    // Map of account address => refund processed
    mapping(address => bool) public mapAccountRefunds;

    constructor(
        address _olas,
        address _contributeManager,
        address _serviceRegistry,
        address _serviceRegistryTokenUtility,
        address _drainer,
        uint256 _refundFactor
    ) {
        // Check for zero addresses
        if (_olas == address(0) || _contributeManager == address(0) || _serviceRegistry == address(0) ||
            _serviceRegistryTokenUtility == address(0) || _drainer == address(0)) {
            revert ZeroAddress();
        }

        // Check for zero value
        if (_refundFactor == 0) {
            revert ZeroValue();
        }

        olas = _olas;
        contributeManager = _contributeManager;
        serviceRegistry = _serviceRegistry;
        serviceRegistryTokenUtility = _serviceRegistryTokenUtility;
        drainer = _drainer;
        refundFactor = _refundFactor;

        owner = msg.sender;
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
        // Get service multisig
        (, address multisig, , , , uint32 numAgentInstances, IService.ServiceState state) =
            IService(serviceRegistry).mapServices(serviceId);

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

        // Check that operator balance has been slashed
        if (IService(serviceRegistryTokenUtility).getOperatorBalance(contributeManager, serviceId) != 0) {
            revert ServiceNotSlashed(serviceId);
        }

        // Check that the state is TerminatedBonded
        if (state != IService.ServiceState.TerminatedBonded) {
            revert WrongServiceState(serviceId, state);
        }

        // Record refund has been made
        mapAccountRefunds[msg.sender] = true;

        IService.TokenSecurityDeposit memory tokenSecurityDeposit =
            IService(serviceRegistryTokenUtility).mapServiceIdTokenDeposit(serviceId);

        // Refund
        uint256 refund = (tokenSecurityDeposit.securityDeposit * refundFactor) / 1e18;
        IToken(olas).transfer(msg.sender, refund);

        emit Refunded(msg.sender, refund);
    }

    /// @dev Drains funds.
    /// @notice This function must be called some time after all the refunds have been processed.
    function drain() external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Get balance
        uint256 balance = IToken(olas).balanceOf(address(this));

        // Check for zero value
        if (balance == 0) {
            revert ZeroValue();
        }

        // Transfer funds
        IToken(olas).transfer(drainer, balance);

        emit Drained(drainer, balance);
    }
}