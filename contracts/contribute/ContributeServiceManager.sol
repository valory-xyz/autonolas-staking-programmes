// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Zero address.
error ZeroAddress();

/// @dev Zero value.
error ZeroValue();

/// @title ContributeServiceManager - Smart contract for managing services for contributors
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Tatiana Priemova - <tatiana.priemova@valory.xyz>
/// @author David Vilela - <david.vilelafreire@valory.xyz>
contract ContributeServiceManager {
    // Contributors proxy contract address
    address public immutable contributorsProxy;

    /// @dev StakingNativeToken initialization.
    /// @param _contributorsProxy Contributors proxy contract address.
    constructor(address _contributorsProxy) {
        // Check the zero address
        if (_contributorsProxy == address(0)) {
            revert ZeroAddress();
        }

        contributorsProxy = _contributorsProxy;
    }

    function register(uint256 id, address stakingInstance) external {
//        if (mapSocialHashMultisigs[handleHash] != address(0))
//            revert();
//
//        createSerivce();
//        deploy();
//
//        stake(stakingInstance);
//        mapUserImplemnetations[multisig] = stakingInstance;
    }

    function stake(uint256 serviceId, address stakingInstance) public {

    }

    function unstake() external {

    }
}