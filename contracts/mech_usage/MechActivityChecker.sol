// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {StakingActivityChecker} from "../../lib/autonolas-registries/contracts/staking/StakingActivityChecker.sol";

// Multisig interface
interface IMultisig {
    /// @dev Gets the multisig nonce.
    /// @return Multisig nonce.
    function nonce() external view returns (uint256);
}

// Mech Marketplace interface
interface IMechMarketplace {
    /// @dev Gets deliveries count for a specific mech service multisig.
    /// @param mechServiceMutisig Mech service multisig address.
    /// @return Deliveries count.
    function mapMechServiceDeliveryCounts(address mechServiceMutisig) external view returns (uint256);
}

/// @dev Provided zero address.
error ZeroAddress();

/// @title MechActivityChecker - Smart contract for mech staking activity checking
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract MechActivityChecker is StakingActivityChecker{
    // AI agent mech marketplace contract address.
    address public immutable mechMarketplace;

    /// @dev MechActivityChecker constructor.
    /// @param _mechMarketplace AI agent mech marketplace contract address.
    /// @param _livenessRatio Liveness ratio in the format of 1e18.
    constructor(address _mechMarketplace, uint256 _livenessRatio) StakingActivityChecker(_livenessRatio) {
        if (_mechMarketplace == address(0)) {
            revert ZeroAddress();
        }
        mechMarketplace = _mechMarketplace;
    }
    
    /// @dev Gets service multisig nonces.
    /// @param multisig Service multisig address.
    /// @return nonces Set of a nonce and a deliveries count for the multisig.
    function getMultisigNonces(address multisig) external view virtual override returns (uint256[] memory nonces) {
        nonces = new uint256[](2);
        nonces[0] = IMultisig(multisig).nonce();
        nonces[1] = IMechMarketplace(mechMarketplace).mapMechServiceDeliveryCounts(multisig);
    }

    /// @dev Checks if the service multisig liveness ratio passes the defined liveness threshold.
    /// @notice The formula for calculating the ratio is the following:
    ///         currentNonces - [service multisig nonce at time now (block.timestamp), requests count at time now];
    ///         lastNonces - [service multisig nonce at the previous checkpoint or staking time (tsStart), requests count at time tsStart];
    ///         Requests count difference must be smaller or equal to the nonce difference:
    ///         (currentNonces[1] - lastNonces[1]) <= (currentNonces[0] - lastNonces[0]);
    ///         ratio = (currentNonces[1] - lastNonce[1]) / (block.timestamp - tsStart),
    ///         where ratio >= livenessRatio.
    /// @param curNonces Current service multisig set of nonce and requests count.
    /// @param lastNonces Last service multisig set of nonce and requests count.
    /// @param ts Time difference between current and last timestamps.
    /// @return ratioPass True, if the liveness ratio passes the check.
    function isRatioPass(
        uint256[] memory curNonces,
        uint256[] memory lastNonces,
        uint256 ts
    ) external view virtual override returns (bool ratioPass)
    {
        // If the checkpoint was called in the exact same block, the ratio is zero
        // If the current nonce is not greater than the last nonce, the ratio is zero
        // If the current requests count is not greater than the last requests count, the ratio is zero
        if (ts > 0 && curNonces[0] > lastNonces[0] && curNonces[1] > lastNonces[1]) {
            uint256 diffNonces = curNonces[0] - lastNonces[0];
            uint256 diffRequestsCounts = curNonces[1] - lastNonces[1];
            // Requests counts difference must be less or equal to the nonce difference
            if (diffRequestsCounts <= diffNonces) {
                uint256 ratio = (diffRequestsCounts * 1e18) / ts;
                ratioPass = (ratio >= livenessRatio);
            }
        }
    }
}