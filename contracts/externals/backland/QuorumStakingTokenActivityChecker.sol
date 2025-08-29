// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {StakingActivityChecker, IMultisig} from "../../../lib/autonolas-registries/contracts/staking/StakingActivityChecker.sol";

// QuorumTracker interface
interface IQuorumTracker {
    /// @dev Gets voting stats.
    /// @param multisig Agent multisig performing attestations.
    /// @return votingStats Voting attestations (set of 3 values) for:
    ///         - Casted vote;
    ///         - Considered voting opportunity;
    ///         - No single voting opportunity available.
    function getVotingStats(address multisig) external view returns (uint256[] memory votingStats);
}

/// @dev Zero address.
error ZeroAddress();

/// @title QuorumStakingTokenActivityChecker - Smart contract for performing quorum agent activity check
contract QuorumStakingTokenActivityChecker is StakingActivityChecker {
    // Quorum tracker address
    address public immutable quorumTracker;

    /// @dev QuorumStakingTokenActivityChecker constructor.
    /// @param _quorumTracker Quorum tracker address.
    /// @param _livenessRatio Liveness ratio in the format of 1e18.
    constructor(address _quorumTracker, uint256 _livenessRatio)
        StakingActivityChecker(_livenessRatio)
    {
        // Check for zero address
        if (_quorumTracker == address(0)) {
            revert ZeroAddress();
        }
        quorumTracker = _quorumTracker;
    }

    /// @dev Gets service multisig nonces.
    /// @param multisig Service multisig address.
    /// @return nonces Set of service multisig nonces and attestations count.
    function getMultisigNonces(address multisig) external virtual override view returns (uint256[] memory nonces) {
        // Get voting stats
        uint256[] memory votingStats = IQuorumTracker(quorumTracker).getVotingStats(multisig);

        nonces = new uint256[](4);
        // First nonce represents multisig activity
        nonces[0] = IMultisig(multisig).nonce();
        // Second nonce provides attestations count for casted vote
        nonces[1] = votingStats[0];
        // Third nonce provides attestations count for considered opportunity
        nonces[2] = votingStats[1];
        // Fourth nonce provides attestations count for no single voting opportunity available
        nonces[3] = votingStats[2];
    }

    /// @inheritdoc StakingActivityChecker
    function isRatioPass(
        uint256[] memory curNonces,
        uint256[] memory lastNonces,
        uint256 ts
    ) external view override returns (bool ratioPass) {
        // If the checkpoint was called in the exact same block, the ratio is zero
        // If the current nonce is not greater than the last nonce, the ratio is zero
        if (ts > 0 && curNonces[0] > lastNonces[0]) {
            uint256 ratio;
            if (curNonces[1] > lastNonces[1]) {
                // Staking rewards achieved if the agent places at least 1x attestation about a vote casted
                ratio = ((curNonces[1] - lastNonces[1]) * 1e18) / ts;
                ratioPass = (ratio >= livenessRatio);
            } else {
                // Staking rewards achieved if the agent places at least 2x attestations for either:
                // - Voting opportunity considered, but not voted;
                // - No voting opportunity is available
                ratio = (((curNonces[2] - lastNonces[2]) + (curNonces[3] - lastNonces[3])) * 1e18) / ts;
                // Note that livenessRatio has a coefficient of 2
                ratioPass = (ratio >= 2 * livenessRatio);
            }
        }
    }
}