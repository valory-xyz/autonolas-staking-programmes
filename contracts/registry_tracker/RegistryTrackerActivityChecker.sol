// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {StakingActivityChecker, IMultisig} from "../../lib/autonolas-registries/contracts/staking/StakingActivityChecker.sol";

// RegistryTracker interface
interface IRegistryTracker {
    function isStakingRewardEligible(address multisig) external view returns (bool);
}

/// @dev Zero address.
error ZeroAddress();

/// @title RegistryTrackerActivityChecker - Smart contract for performing registry tracker staking activity check
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract RegistryTrackerActivityChecker is StakingActivityChecker {

    address public immutable registryTracker;

    /// @dev RegistryTrackerActivityChecker constructor.
    /// @notice Liveness ratio is 1 to a minimal possible as it is not relevant for this activity checker.
    /// @param _registryTracker Registry Tracker address.
    constructor(address _registryTracker)
        StakingActivityChecker(1)
    {
        if (_registryTracker == address(0)) {
            revert ZeroAddress();
        }
        registryTracker = _registryTracker;
    }

    /// @dev Gets service multisig addresses as nonces.
    /// @param multisig Service multisig address.
    /// @return nonces Set of service multisig nonces.
    function getMultisigNonces(address multisig) external virtual override view returns (uint256[] memory nonces) {
        // Allocate required nonces array
        nonces = new uint256[](1);

        // Nonce consists of the multisig address
        nonces[0] = uint256(uint160(multisig));
    }

    /// @inheritdoc StakingActivityChecker
    function isRatioPass(
        uint256[] memory curNonces,
        uint256[] memory,
        uint256
    ) external view override returns (bool ratioPass) {
        // Get multisig address from a nonce
        address multisig = address(uint160(curNonces[0]));

        // Get staking reward eligibility status
        ratioPass = IRegistryTracker(registryTracker).isStakingRewardEligible(multisig);
    }
}