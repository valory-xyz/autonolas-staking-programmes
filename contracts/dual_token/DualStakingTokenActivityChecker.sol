// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {StakingActivityChecker, IMultisig} from "../../lib/autonolas-registries/contracts/staking/StakingActivityChecker.sol";

// DualStakingToken interface
interface IDualStakingToken {
    function mapMutisigs(address multisig) external view returns (bool);
}

/// @dev Zero address.
error ZeroAddress();

/// @dev Unauthorized account.
/// @param account Account address.
error UnauthorizedAccount(address account);

/// @title DualStakingTokenActivityChecker - Smart contract for performing dual token service staking activity check
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract DualStakingTokenActivityChecker is StakingActivityChecker {
    // DualStakingToken contract address
    address public dualStakingToken;
    // Temporary owner address
    address public owner;

    /// @dev DualStakingTokenActivityChecker constructor.
    /// @param _livenessRatio Liveness ratio in the format of 1e18.
    constructor(uint256 _livenessRatio)
        StakingActivityChecker(_livenessRatio)
    {
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

    /// @dev Gets service multisig nonces.
    /// @param multisig Service multisig address.
    /// @return nonces Set of a single service multisig nonce.
    function getMultisigNonces(address multisig) external virtual override view returns (uint256[] memory nonces) {
        // Check for token duality
        // This check prevents from staking directly to service staking contract without locking the second token
        if (!IDualStakingToken(dualStakingToken).mapMutisigs(multisig)) {
            revert UnauthorizedAccount(multisig);
        }

        nonces = new uint256[](1);
        // The nonce is equal to the social off-chain activity corresponding to a multisig activity
        nonces[0] = IMultisig(multisig).nonce();
    }
}