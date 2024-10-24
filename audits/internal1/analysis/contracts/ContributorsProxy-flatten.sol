// Sources flattened with hardhat v2.22.4 https://hardhat.org

// SPDX-License-Identifier: MIT

// File contracts/contribute/ContributorsProxy.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.25;

/// @dev Zero implementation address.
error ZeroImplementationAddress();

/// @dev Zero contributors data.
error ZeroContributorsData();

/// @dev Proxy initialization failed.
error InitializationFailed();

/*
* This is a Contributors proxy contract.
* Proxy implementation is created based on the Universal Upgradeable Proxy Standard (UUPS) EIP-1822.
* The implementation address must be located in a unique storage slot of the proxy contract.
* The upgrade logic must be located in the implementation contract.
* Special contributors implementation address slot is produced by hashing the "CONTRIBUTORS_PROXY"
* string in order to make the slot unique.
* The fallback() implementation for all the delegatecall-s is inspired by the Gnosis Safe set of contracts.
*/

/// @title ContributorsProxy - Smart contract for contributors proxy
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Tatiana Priemova - <tatiana.priemova@valory.xyz>
/// @author David Vilela - <david.vilelafreire@valory.xyz>
contract ContributorsProxy {
    // Code position in storage is keccak256("CONTRIBUTORS_PROXY") = "0x8f33b4c48c4f3159dc130f2111086160da6c94439c147bd337ecee0aa81518c7"
    bytes32 public constant CONTRIBUTORS_PROXY = 0x8f33b4c48c4f3159dc130f2111086160da6c94439c147bd337ecee0aa81518c7;

    /// @dev ContributorsProxy constructor.
    /// @param implementation Contributors implementation address.
    /// @param contributorsData Contributors initialization data.
    constructor(address implementation, bytes memory contributorsData) {
        // Check for the zero address, since the delegatecall works even with the zero one
        if (implementation == address(0)) {
            revert ZeroImplementationAddress();
        }

        // Check for the zero data
        if (contributorsData.length == 0) {
            revert ZeroContributorsData();
        }

        // Store the contributors implementation address
        assembly {
            sstore(CONTRIBUTORS_PROXY, implementation)
        }
        // Initialize proxy tokenomics storage
        (bool success, ) = implementation.delegatecall(contributorsData);
        if (!success) {
            revert InitializationFailed();
        }
    }

    /// @dev Delegatecall to all the incoming data.
    fallback() external {
        assembly {
            let implementation := sload(CONTRIBUTORS_PROXY)
            calldatacopy(0, 0, calldatasize())
            let success := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            if eq(success, 0) {
                revert(0, returndatasize())
            }
            return(0, returndatasize())
        }
    }
}
