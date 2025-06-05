// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev Zero implementation address.
error ZeroImplementationAddress();

/// @dev Zero registryTracker data.
error ZeroRegistryTrackerData();

/// @dev Proxy initialization failed.
error InitializationFailed();

/*
* This is a RegistryTracker proxy contract.
* Proxy implementation is created based on the Universal Upgradeable Proxy Standard (UUPS) EIP-1822.
* The implementation address must be located in a unique storage slot of the proxy contract.
* The upgrade logic must be located in the implementation contract.
* Special registryTracker implementation address slot is produced by hashing the "REGISTRY_TRACKER_PROXY"
* string in order to make the slot unique.
* The fallback() implementation for all the delegatecall-s is inspired by the Gnosis Safe set of contracts.
*/

/// @title RegistryTrackerProxy - Smart contract for Registry Tracker proxy
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract RegistryTrackerProxy {
    // Code position in storage is keccak256("REGISTRY_TRACKER_PROXY") = "0x74d7566dbc76da138d8eaf64f2774351bdfd8119d17c7d6332c2dc73d31d555a"
    bytes32 public constant REGISTRY_TRACKER_PROXY = 0x74d7566dbc76da138d8eaf64f2774351bdfd8119d17c7d6332c2dc73d31d555a;

    /// @dev RegistryTrackerProxy constructor.
    /// @param implementation RegistryTracker implementation address.
    /// @param registryTrackerData RegistryTracker initialization data.
    constructor(address implementation, bytes memory registryTrackerData) {
        // Check for the zero address, since the delegatecall works even with the zero one
        if (implementation == address(0)) {
            revert ZeroImplementationAddress();
        }

        // Check for the zero data
        if (registryTrackerData.length == 0) {
            revert ZeroRegistryTrackerData();
        }

        // Store the registryTracker implementation address
        assembly {
            sstore(REGISTRY_TRACKER_PROXY, implementation)
        }
        // Initialize proxy tokenomics storage
        (bool success, ) = implementation.delegatecall(registryTrackerData);
        if (!success) {
            revert InitializationFailed();
        }
    }

    /// @dev Delegatecall to all the incoming data.
    fallback() external {
        assembly {
            let implementation := sload(REGISTRY_TRACKER_PROXY)
            calldatacopy(0, 0, calldatasize())
            let success := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            if eq(success, 0) {
                revert(0, returndatasize())
            }
            return(0, returndatasize())
        }
    }

    /// @dev Gets implementation address.
    function getImplementation() external view returns (address implementation) {
        assembly {
            implementation := sload(REGISTRY_TRACKER_PROXY)
        }
    }
}