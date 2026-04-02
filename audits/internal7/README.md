# Internal Audit 7 — autonolas-staking-programmes

**Commit**: 30af962 (branch: main)
**Repository**: `valory-xyz/autonolas-staking-programmes`
**Scope**: All active contracts in `contracts/` (3,681 LOC)
**Methodology**: Internal security audit playbook v2.21 (268 DeFi patterns, 30 rules), Slither static analysis, manual code review

## Auditor

**Claude Opus 4.6** (Anthropic) operating as Claude Code CLI, guided by human security researcher.

## Tools Used

| Tool | Version | Results |
|------|---------|---------|
| **Slither** | 0.10.4 | 96 results: reentrancy concerns in Contributors (confirmed guarded), naming conventions |
| **Forge** | nightly-2026 | Compilation successful |
| **Manual Review** | Playbook v2.21 | 8 findings (0M/4L/4I) |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 4 |
| Informational | 5 |
| **Total** | **9** |

---

## Low Findings

### L-1: Unchecked ERC20 transfer return values in Contributors.sol

**File**: `Contributors.sol:209,211,279`

`IToken(olas).transferFrom()`, `IToken(olas).approve()`, and `IToken(olas).transfer()` return values not checked.

**Exploit analysis**: No exploit path. OLAS token is hardcoded via immutable `olas` address, validated in constructor. OLAS is standard ERC20 that reverts on failure. Documented design choice consistent with other Olas repositories.

> **Resolution**: Won't fix. OLAS token is hardcoded and reverts on failure.

### L-2: Unchecked ERC20 transfer return values in RecovererContributeManager.sol

**File**: `RecovererContributeManager.sol:173,195`

Same pattern as L-1. OLAS token hardcoded. No exploit path.

> **Resolution**: Won't fix. OLAS token is hardcoded and reverts on failure.

### L-3: Unchecked ERC20 transfer in StakingAirdrop.sol with arbitrary token

**File**: `StakingAirdrop.sol:166,234`

Unlike Contributors (hardcoded to OLAS), StakingAirdrop accepts an **arbitrary token** via constructor `_token`. If deployed with a non-reverting ERC20 (e.g., USDT), `transfer` returning `false` would be silently ignored.

**Exploit scenario**: Deploy StakingAirdrop with a non-reverting token. `claim()` at line 163 sets `mapServiceIdAirdropAmount[serviceId] = 0` before calling `transfer`. If transfer returns false, airdrop is marked claimed but no tokens sent.

**Current deployments**: All known deployments use OLAS (reverts on failure). Risk materializes only with non-standard tokens.

**Recommendation**: Use `SafeTransferLib.safeTransfer()` (already available in repo at `contracts/libraries/SafeTransferLib.sol`).

> **Resolution**: Fixed. Replaced `IToken(token).transfer()` with `SafeTransferLib.safeTransfer()` in both `claim()` and `claimAll()`.

### L-4: QuorumStakingTokenActivityChecker potential underflow

**File**: `externals/backland/QuorumStakingTokenActivityChecker.sol:74`

```solidity
ratio = (((curNonces[2] - lastNonces[2]) + (curNonces[3] - lastNonces[3])) * 1e18) / ts;
```

If external `getVotingStats` returns decreasing nonces (bug or reset in quorum tracker), this underflows and reverts. The staking contract would treat the service as inactive (eviction). Risk bounded by external contract trust assumption.

> **Resolution**: Out of scope. External contract dependency; underflow revert is acceptable behavior.

---

## Informational Findings

| ID | Title | File | Resolution |
|----|-------|------|------------|
| I-1 | Wrong error type: `ZeroAddress()` instead of `ZeroValue()` | RegistryTracker.sol:209 | **Fixed** |
| I-2 | `attestByDelegation` counter increment by anyone | DualStakingToken.sol:332 (no exploit: requires staked multisig bit) | **Won't fix** |
| I-3 | DualStakingToken fallback staticcall proxy exposes all view functions | DualStakingToken.sol:349 | **Won't fix** |
| I-4 | Predictable create2 salt in Contributors | Contributors.sol:464 (non-exploitable: immediate deploy+stake) | **Won't fix** |
| I-5 | RecovererContributeManager assumes single-owner multisig | RecovererContributeManager.sol:145 (see analysis below) | **Won't fix**: by design |

---

## Slither Analysis

| Detector | Count | Assessment |
|----------|:-----:|-----------|
| Reentrancy concerns | 3 | False positive — all protected by `_locked` reentrancy guards |
| Sends ETH to arbitrary user | 1 | In deprecated ContributeManager only |
| Naming conventions | ~80 | Info — Olas convention |
| Other | ~12 | Info — standard detectors |

**No genuine High or Medium from Slither.**

---

## Cross-Reference with Previous Audits (internal1-6)

| Prior Finding | Status |
|--------------|--------|
| internal2 Critical: refundFactor not set in RecovererContributeManager | **FIXED** |
| internal2 Medium: Missed reentrancy guard in Contributors | **FIXED** — `_locked` guard added on all paths |
| internal2 Medium: Old proxy vs new implementation | **Noted** |
| internal4 Low: Balance possibly zero | **FIXED** |
| internal6 Medium/Notes: mapActiveMutisigAttestations tx origin | **Noted** — counter increment is per-msg.sender, effectively self-gated for staked multisigs |

All prior Critical/Medium findings have been addressed.

---

## Checklist Compliance

| Area | Items Checked | Findings |
|------|:---:|:---:|
| Reentrancy | 8 | 0 (all guarded) |
| Access control | 10 | 0 |
| ERC20 transfers | 5 | L-1, L-2, L-3 |
| Proxy storage | 4 | 0 |
| Double-claim | 4 | 0 (CEI pattern correct) |
| Integer overflow | 4 | L-4 (external dependency) |
| Activity checkers | 4 | I-2 |
| Staking lifecycle | 6 | 0 |
| Items 262-268 | 7 | 0 |

---

### I-5: RecovererContributeManager assumes single-owner multisig

**File**: `RecovererContributeManager.sol:145`

```solidity
if (multisigOwners.length != numAgentInstances || multisigOwners[0] != msg.sender) {
    revert UnauthorizedAccount(msg.sender);
}
```

The check `multisigOwners[0] != msg.sender` only verifies the FIRST owner of the multisig. If a service had multiple owners, any additional owners would be ignored — only `owners[0]` can recover.

**Analysis**: This is safe in the current architecture because:
1. Both `Contributors.sol` (line 59) and deprecated `ContributeManager.sol` (line 68) hardcode `NUM_AGENT_INSTANCES = 1`
2. The `operator == contributeManager` check at line 150-151 ensures the service was created through these contracts
3. Therefore `numAgentInstances` is always 1, and `multisigOwners.length != 1` rejects any modified Safe

The constraint is **architecturally enforced but not documented** in RecovererContributeManager itself. If a future ContributeManager version allows >1 agents, RecovererContributeManager would silently exclude non-first owners from recovery.

**Recommendation**: Add a comment documenting the single-agent assumption, or iterate over all owners instead of checking only `multisigOwners[0]`.

> **Resolution**: Won't fix. Single multisig signer is by design, enforced by the Contributors contract implementation (`NUM_AGENT_INSTANCES = 1`).

---

## Test Coverage Gaps

| Contract | Test References | Risk |
|----------|:-:|------|
| RequesterSingleMechActivityChecker | 0 | Low — simple view-only math, underflow = benign revert. Deprecated and moved to `contracts/mech_usage/deprecated/` |
| SafeTransferLib | 0 | Low — solmate-audited assembly, verified correct |
| RecovererContributeManager | 2 | Low — CEI correct, OLAS-only, manually verified |

All three untested/under-tested contracts were manually audited. No additional findings beyond those already reported. Recommend adding basic unit tests for RequesterSingleMechActivityChecker edge cases (zero timestamp, decreasing nonces).

---

## Conclusion

The autonolas-staking-programmes codebase is well-hardened after 6 prior internal audits. No Critical, High, or Medium findings. The most actionable finding is **L-3** (StakingAirdrop with arbitrary token should use SafeTransferLib). All other Low findings have no exploit path with current OLAS token deployments. The reentrancy concerns flagged by Slither are false positives — all state-changing functions have proper `_locked` guards.
