// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {RequesterActivityChecker} from "../contracts/mech_usage/RequesterActivityChecker.sol";
import {RequesterActivityCheckerV2} from "../contracts/mech_usage/RequesterActivityCheckerV2.sol";
import {MockAgentMech} from "../contracts/test/MockAgentMech.sol";

/// @dev Minimal multisig exposing the Safe-style nonce() getter used by getMultisigNonces.
contract MockMultisig {
    uint256 public nonce;

    function setNonce(uint256 newNonce) external {
        nonce = newNonce;
    }
}

/// @title RequesterActivityCheckerV2Test - Unit tests isolating the V1 -> V2 behavioural change.
/// @notice The only logic difference between V1 and V2 is inside isRatioPass: V2 drops the Safe-nonce
///         precondition and the (diffRequestsCounts <= diffNonces) parity guard, keeping the ratio math
///         identical. These tests exercise isRatioPass directly with crafted nonce arrays so the change
///         is provable without the full staking/Safe integration harness.
contract RequesterActivityCheckerV2Test is Test {
    RequesterActivityChecker internal v1;
    RequesterActivityCheckerV2 internal v2;
    MockAgentMech internal marketplace;

    // Same magnitude as production configs: one request per 1e4 seconds (~2.78h) clears the threshold.
    uint256 internal constant LIVENESS_RATIO = 0.0001 ether; // 1e14

    function setUp() public {
        marketplace = new MockAgentMech();
        v1 = new RequesterActivityChecker(address(marketplace), LIVENESS_RATIO);
        v2 = new RequesterActivityCheckerV2(address(marketplace), LIVENESS_RATIO);
    }

    /// @dev Builds a length-2 [nonce, requestsCount] array.
    function _nonces(uint256 safeNonce, uint256 requestsCount) internal pure returns (uint256[] memory arr) {
        arr = new uint256[](2);
        arr[0] = safeNonce;
        arr[1] = requestsCount;
    }

    /// @dev The gap V2 closes: off-chain path where the Safe nonce did not advance but requests landed.
    ///      V1 fails on the curNonces[0] > lastNonces[0] precondition; V2 passes on the request count alone.
    function test_OffchainPath_V1Fails_V2Passes() external view {
        // Safe nonce unchanged (5 -> 5), 10 mech requests settled off-chain (0 -> 10)
        uint256[] memory last = _nonces(5, 0);
        uint256[] memory cur = _nonces(5, 10);
        uint256 ts = 1 days; // ratio = 10 * 1e18 / 86400 = 1.157e14 >= 1e14

        assertFalse(v1.isRatioPass(cur, last, ts), "V1 must fail when the Safe nonce did not advance");
        assertTrue(v2.isRatioPass(cur, last, ts), "V2 must pass on requests count alone");
    }

    /// @dev No regression: an on-chain pattern that passes V1 (each request backed by a Safe tx) passes V2 identically.
    function test_OnchainPath_BothPass() external view {
        // 10 Safe txs and 10 requests in the same window: diffNonces == diffRequestsCounts
        uint256[] memory last = _nonces(0, 0);
        uint256[] memory cur = _nonces(10, 10);
        uint256 ts = 1 days;

        assertTrue(v1.isRatioPass(cur, last, ts), "V1 should pass on the on-chain path");
        assertTrue(v2.isRatioPass(cur, last, ts), "V2 should pass identically on the on-chain path");
    }

    /// @dev On-chain pattern below the liveness threshold fails both, identically.
    function test_OnchainPath_BelowThreshold_BothFail() external view {
        // 1 request over a full day: ratio = 1 * 1e18 / 86400 = 1.157e13 < 1e14
        uint256[] memory last = _nonces(0, 0);
        uint256[] memory cur = _nonces(1, 1);
        uint256 ts = 1 days;

        assertFalse(v1.isRatioPass(cur, last, ts), "V1 should fail below threshold");
        assertFalse(v2.isRatioPass(cur, last, ts), "V2 should fail identically below threshold");
    }

    /// @dev Behaviour at the exact threshold matches between V1 and V2 (ratio == livenessRatio passes; one second more fails).
    function test_ThresholdBoundary_Identical() external view {
        // ratio == livenessRatio exactly: 1 request, ts = 1e18 / 1e14 = 1e4 seconds
        uint256[] memory last = _nonces(0, 0);
        uint256[] memory cur = _nonces(1, 1);
        uint256 tsAtThreshold = 1e4;
        assertTrue(v1.isRatioPass(cur, last, tsAtThreshold), "V1 passes at the threshold");
        assertTrue(v2.isRatioPass(cur, last, tsAtThreshold), "V2 passes at the threshold");

        // One second past the threshold window: ratio drops just below livenessRatio
        uint256 tsPastThreshold = 1e4 + 1;
        assertFalse(v1.isRatioPass(cur, last, tsPastThreshold), "V1 fails just past the threshold");
        assertFalse(v2.isRatioPass(cur, last, tsPastThreshold), "V2 fails just past the threshold");
    }

    /// @dev No new requests -> both fail regardless of how many Safe txs were sent.
    function test_NoNewRequests_BothFail() external view {
        uint256[] memory last = _nonces(5, 5);
        uint256[] memory cur = _nonces(9, 5); // nonce advanced, request count flat
        uint256 ts = 1 days;

        assertFalse(v1.isRatioPass(cur, last, ts), "V1 must fail with no new requests");
        assertFalse(v2.isRatioPass(cur, last, ts), "V2 must fail with no new requests");
    }

    /// @dev Same-block checkpoint (ts == 0) -> both fail.
    function test_ZeroTimeDelta_BothFail() external view {
        uint256[] memory last = _nonces(0, 0);
        uint256[] memory cur = _nonces(10, 10);

        assertFalse(v1.isRatioPass(cur, last, 0), "V1 must fail with zero time delta");
        assertFalse(v2.isRatioPass(cur, last, 0), "V2 must fail with zero time delta");
    }

    /// @dev V2 is strictly weaker than V1: anything that passes V1 must also pass V2.
    function testFuzz_V1PassImpliesV2Pass(
        uint256 lastNonce,
        uint256 lastReq,
        uint256 deltaNonce,
        uint256 deltaReq,
        uint256 ts
    ) external view {
        // Bound to realistic ranges and to avoid the diffRequestsCounts * 1e18 overflow
        lastNonce = bound(lastNonce, 0, 1e12);
        lastReq = bound(lastReq, 0, 1e12);
        deltaNonce = bound(deltaNonce, 0, 1e12);
        deltaReq = bound(deltaReq, 0, 1e12);
        ts = bound(ts, 0, 1e12);

        uint256[] memory last = _nonces(lastNonce, lastReq);
        uint256[] memory cur = _nonces(lastNonce + deltaNonce, lastReq + deltaReq);

        if (v1.isRatioPass(cur, last, ts)) {
            assertTrue(v2.isRatioPass(cur, last, ts), "every V1 pass must also pass V2");
        }
    }

    /// @dev ABI compatibility: getMultisigNonces keeps the length-2 [nonce, requestsCount] shape in V2.
    ///      This is the off-chain compatibility contract - downstream consumers read requests at index 1.
    function test_GetMultisigNonces_ShapeAndValuesIdentical() external {
        MockMultisig multisig = new MockMultisig();
        multisig.setNonce(42);
        // Bump the marketplace request counter for this multisig to 7
        for (uint256 i = 0; i < 7; ++i) {
            marketplace.increaseRequestsCount(address(multisig));
        }

        uint256[] memory n1 = v1.getMultisigNonces(address(multisig));
        uint256[] memory n2 = v2.getMultisigNonces(address(multisig));

        assertEq(n1.length, 2, "V1 must return a length-2 array");
        assertEq(n2.length, 2, "V2 must keep the length-2 array shape");
        assertEq(n2[0], 42, "index 0 stays the Safe nonce (informational)");
        assertEq(n2[1], 7, "index 1 stays the requests count (activity signal)");
        assertEq(n1[0], n2[0], "Safe nonce must match V1");
        assertEq(n1[1], n2[1], "requests count must match V1");
    }
}
