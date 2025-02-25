// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// DualStakingToken interface
interface IDualStakingToken {
    function mapMutisigs(address multisig) external view returns (bool);
}

// Multisig interface
interface IMultisig {
    function nonce() external view returns (uint256);
}

/// @dev Zero address.
error ZeroAddress();

/// @dev Zero value.
error ZeroValue();

/// @dev Unauthorized account.
/// @param account Account address.
error UnauthorizedAccount(address account);

/// @dev State is locked.
error Locked();

/// @title DualStakingTokenActivityChecker - Smart contract for performing dual token service staking activity check
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract DualStakingTokenActivityChecker {
    // Liveness ratio in the format of 1e18
    uint256 public immutable livenessRatio;

    // DualStakingToken contract address
    address public dualStakingToken;
    // Temporary owner address
    address public owner;
    // Lock
    uint256 internal _locked = 2;

    /// @dev DualStakingTokenActivityChecker constructor.
    /// @param _livenessRatio Liveness ratio in the format of 1e18.
    constructor(uint256 _livenessRatio) {
        // Check for zero value
        if (_livenessRatio == 0) {
            revert ZeroValue();
        }

        livenessRatio = _livenessRatio;
        owner = msg.sender;
    }

    /// @dev Sets DualStakingToken contract address and resets the owner.
    /// @param _dualStakingToken DualStakingToken contract address.
    function setDualStakingToken(address _dualStakingToken) external {
        if (msg.sender != owner) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check the zero address
        if (_dualStakingToken == address(0)) {
            revert ZeroAddress();
        }

        dualStakingToken = _dualStakingToken;

        // Resets the owner
        owner = address(0);
    }

    /// @dev Locks activity checker.
    function lock() external {
        if (msg.sender != dualStakingToken) {
            revert UnauthorizedAccount(msg.sender);
        }

        _locked = 2;
    }

    /// @dev Unlocks activity checker.
    function unlock() external {
        if (msg.sender != dualStakingToken) {
            revert UnauthorizedAccount(msg.sender);
        }

        _locked = 1;
    }

    /// @dev Gets service multisig nonces.
    /// @param multisig Service multisig address.
    /// @return nonces Set of a single service multisig nonce.
    function getMultisigNonces(address multisig) external view virtual returns (uint256[] memory nonces) {
        // Check for token duality
        // This check prevents from staking directly to service staking contract without locking the staking token as well
        if (!IDualStakingToken(dualStakingToken).mapMutisigs(multisig)) {
            revert UnauthorizedAccount(multisig);
        }

        nonces = new uint256[](1);
        // The nonce is equal to the social off-chain activity corresponding to a multisig activity
        nonces[0] = IMultisig(multisig).nonce();
    }

    /// @dev Checks if the service multisig liveness ratio passes the defined liveness threshold.
    /// @notice The formula for calculating the ratio is the following:
    ///         currentNonce - service multisig nonce at time now (block.timestamp);
    ///         lastNonce - service multisig nonce at the previous checkpoint or staking time (tsStart);
    ///         ratio = (currentNonce - lastNonce) / (block.timestamp - tsStart).
    /// @param curNonces Current service multisig set of a single nonce.
    /// @param lastNonces Last service multisig set of a single nonce.
    /// @param ts Time difference between current and last timestamps.
    /// @return ratioPass True, if the liveness ratio passes the check.
    function isRatioPassCheck(
        uint256[] memory curNonces,
        uint256[] memory lastNonces,
        uint256 ts
    ) public view returns (bool ratioPass) {
        // If the checkpoint was called in the exact same block, the ratio is zero
        // If the current nonce is not greater than the last nonce, the ratio is zero
        if (ts > 0 && curNonces[0] > lastNonces[0]) {
            uint256 ratio = ((curNonces[0] - lastNonces[0]) * 1e18) / ts;
            ratioPass = (ratio >= livenessRatio);
        }
    }

    /// @dev Checks if the service multisig liveness ratio passes the defined liveness threshold.
    /// @notice This function can be called after dualStakingToken unlocks its execution.
    ///         For read-only result call isRatioPassCheck() function.
    /// @param curNonces Current service multisig set of a single nonce.
    /// @param lastNonces Last service multisig set of a single nonce.
    /// @param ts Time difference between current and last timestamps.
    /// @return ratioPass True, if the liveness ratio passes the check.
    function isRatioPass(
        uint256[] memory curNonces,
        uint256[] memory lastNonces,
        uint256 ts
    ) external view virtual returns (bool ratioPass) {
        // Check for lock
        // This lock prevents checkpoint being called directly from service staking contract
        if (_locked == 2) {
            revert Locked();
        }

        ratioPass = isRatioPassCheck(curNonces, lastNonces, ts);
    }
}