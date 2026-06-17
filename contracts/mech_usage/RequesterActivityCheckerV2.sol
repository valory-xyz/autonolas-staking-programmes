// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {StakingActivityChecker} from "../../lib/autonolas-registries/contracts/staking/StakingActivityChecker.sol";

// Multisig interface
interface IMultisig {
    /// @dev Gets the multisig nonce.
    /// @return Multisig nonce.
    function nonce() external view returns (uint256);
}

// Mech Marketplace interface
interface IMechMarketplace {
    /// @dev Gets the requests count for a specific requester account.
    /// @param requester Requester address.
    /// @return requestsCount Requests count.
    function mapRequestCounts(address requester) external view returns (uint256 requestsCount);
}

/// @dev Provided zero address.
error ZeroAddress();

/// @title RequesterActivityCheckerV2 - Smart contract for requester staking activity checking
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
/// @notice Drop-in replacement for RequesterActivityChecker. The activity signal is the mech requests
///         count alone (mapRequestCounts), and the Safe-nonce side of the V1 activity guard is removed.
///
///         Rationale: under the off-chain delivery path (deliver-with-signature) a whole multisend of
///         mech requests settles against a single Safe nonce flip, so the V1 requirement that the
///         requests-count delta be backed one-for-one by Safe-nonce deltas can never be met. The
///         anti-gaming role of that guard is already enforced by the marketplace itself: every increment
///         to mapRequestCounts goes through Safe-signature verification, a monotonic per-requester nonce
///         (replay protection), and a real USDC charge at settle. The dropped check is therefore redundant.
///
///         V2 is strictly weaker than V1: anything that passed V1 also passes V2 with identical behaviour
///         at the threshold (on the on-chain path diffNonces >= diffRequestsCounts holds by construction,
///         so the dropped guards never bound). getMultisigNonces is unchanged - it still returns the
///         length-2 array [multisig.nonce(), mapRequestCounts(multisig)] so downstream consumers
///         (frontends, indexers, scripts, events) keep working; index 0 is informational only and is no
///         longer referenced inside isRatioPass.
contract RequesterActivityCheckerV2 is StakingActivityChecker {
    // Version number
    string public constant VERSION = "0.2.0";
    // AI agent mech marketplace contract address.
    address public immutable mechMarketplace;

    /// @dev RequesterActivityCheckerV2 constructor.
    /// @param _mechMarketplace AI agent mech marketplace contract address.
    /// @param _livenessRatio Liveness ratio in the format of 1e18.
    constructor(address _mechMarketplace, uint256 _livenessRatio) StakingActivityChecker(_livenessRatio) {
        if (_mechMarketplace == address(0)) {
            revert ZeroAddress();
        }
        mechMarketplace = _mechMarketplace;
    }

    /// @dev Gets service multisig nonces.
    /// @notice Index 0 (the Safe nonce) is kept for ABI compatibility with downstream consumers and is
    ///         informational only; the liveness check relies on index 1 (the requests count) alone.
    /// @param multisig Service multisig address.
    /// @return nonces Set of a nonce and a requests count for the multisig.
    function getMultisigNonces(address multisig) external view virtual override returns (uint256[] memory nonces) {
        nonces = new uint256[](2);
        nonces[0] = IMultisig(multisig).nonce();
        nonces[1] = IMechMarketplace(mechMarketplace).mapRequestCounts(multisig);
    }

    /// @dev Checks if the service multisig liveness ratio passes the defined liveness threshold.
    /// @notice The formula for calculating the ratio is the following:
    ///         currentNonces - [service multisig nonce at time now (block.timestamp), requests count at time now];
    ///         lastNonces - [service multisig nonce at the previous checkpoint or staking time (tsStart), requests count at time tsStart];
    ///         ratio = (currentNonces[1] - lastNonces[1]) / (block.timestamp - tsStart),
    ///         where ratio >= livenessRatio.
    ///         Unlike V1, the requests-count delta is not required to be backed by the Safe-nonce delta;
    ///         the requests count (index 1) alone determines the activity signal.
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
        // If the current requests count is not greater than the last requests count, the ratio is zero
        if (ts > 0 && curNonces[1] > lastNonces[1]) {
            uint256 diffRequestsCounts = curNonces[1] - lastNonces[1];
            uint256 ratio = (diffRequestsCounts * 1e18) / ts;
            ratioPass = (ratio >= livenessRatio);
        }
    }
}
