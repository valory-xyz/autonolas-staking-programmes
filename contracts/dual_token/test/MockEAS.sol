// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IEAS} from "../interfaces/IEAS.sol";

contract MockEAS {
    function attestByDelegation(IEAS.DelegatedAttestationRequest calldata delegatedRequest) external payable returns (bytes32) {
        return bytes32(keccak256(abi.encode(delegatedRequest)));
    }
}
