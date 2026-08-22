# Contracts vulnerabilities

## Vulnerabilities list

- [Involved contracts and level of the bugs](#involved-contracts-and-level-of-the-bugs)
- [Vulnerabilities](#vulnerabilities)
    - [1. RegistryTracker registration replay is keyed by multisig, not service Id](#1-registrytracker-registration-replay-is-keyed-by-multisig-not-service-id)
    - [2. RegistryTracker accepts a disabled staking instance](#2-registrytracker-accepts-a-disabled-staking-instance)
    - [3. DualStakingToken.restake discards the base staking reward](#3-dualstakingtokenrestake-discards-the-base-staking-reward)
    - [4. DualStakingToken.unstake clears the activity marker before the base checkpoint](#4-dualstakingtokenunstake-clears-the-activity-marker-before-the-base-checkpoint)
    - [5. RequesterActivityChecker (V1) under-counts requests not backed one-for-one by Safe nonce growth](#5-requesteractivitychecker-v1-under-counts-requests-not-backed-one-for-one-by-safe-nonce-growth)
    - [6. MechActivityChecker under-counts batched signed deliveries](#6-mechactivitychecker-under-counts-batched-signed-deliveries)
    - [7. Activity liveness KPIs can be satisfied by self-generated mech usage](#7-activity-liveness-kpis-can-be-satisfied-by-self-generated-mech-usage)
    - [8. Zero-rate delivery entries count toward mech activity](#8-zero-rate-delivery-entries-count-toward-mech-activity)
    - [9. StakingAirdrop.claimAll strands a zero-multisig entitlement](#9-stakingairdropclaimall-strands-a-zero-multisig-entitlement)
    - [10. StakingAirdrop pays a terminated service's parked multisig](#10-stakingairdrop-pays-a-terminated-services-parked-multisig)
    - [11. Contributors existing-service stake path does not enforce the OLAS staking token](#11-contributors-existing-service-stake-path-does-not-enforce-the-olas-staking-token)
    - [12. RegistryTracker registration can revive a service past the inactivity eviction threshold](#12-registrytracker-registration-can-revive-a-service-past-the-inactivity-eviction-threshold)
    - [13. DualStakingToken applies a fixed second-token amount regardless of service size](#13-dualstakingtoken-applies-a-fixed-second-token-amount-regardless-of-service-size)

## Involved contracts and level of the bugs

This document records known issues in the `autonolas-staking-programmes` contracts, each paired with
its operational or contract-level mitigation. Entries here are found in the current `main` sources.

**Two clarifications about what this list is.**

*Every entry is live.* An entry is removed once its issue is resolved and deployed, so anything
still listed here is either unresolved or awaiting deployment. Do not read a listing as an accepted
trade-off: some entries are deliberately-unfixed trade-offs, others are identified defects with a
recommended code fix and no acceptance decision recorded, and the entry body says which. The list
carries no per-entry status field — on a list that deletes its own resolved entries such a field is
redundant where it is right and misleading as soon as it goes stale.

*Scope.* This repository is not currently among those whose vulnerabilities lists the public Olas
bug-bounty programme enumerates in its known-issues clause, and these contracts do not currently
appear in that programme's assets-in-scope. This file is therefore an internal engineering record, and
an entry here does not by itself make a report about it ineligible. If this repository is brought into
scope, this list should be added to that clause at the same time.

| Contract | Level |
|---|---|
| RegistryTracker | Low |
| DualStakingToken | Low |
| RequesterActivityChecker | Low |
| MechActivityChecker | Low |
| StakingAirdrop | Low |
| Contributors | Low |

## Vulnerabilities

### 1. RegistryTracker registration replay is keyed by multisig, not service Id

**Severity**: Low
**Source**: internal review

`RegistryTracker.registerServiceMultisig` guards against re-registration by the service **multisig**:

```solidity
if (mapMultisigRegisteringTime[serviceInfo.multisig] > 0) {
    revert AlreadyRegistered(serviceInfo.multisig, serviceId);
}
mapMultisigRegisteringTime[serviceInfo.multisig] = block.timestamp;
```

The key is the multisig address, not the `serviceId`. A service that is unstaked, terminated, unbonded and
re-deployed with a fresh whitelisted Safe presents a new multisig whose registration time is zero, so it can
register again under the same `serviceId` and be marked eligible for another initial-reward window.

`RegistryTracker` holds no funds and distributes nothing on-chain: `isStakingRewardEligible(multisig)` is an
eligibility view consumed off-chain by the initial-reward campaign. The exposure is therefore one off-chain
campaign payout per replay, bounded by the cost of a full re-deploy cycle; there is no on-chain drain.

**Mitigation.** Off-chain, the reward campaign can de-duplicate by `serviceId`. On a future RegistryTracker
revision, additionally gate registration on the `serviceId` (e.g. a `mapServiceIdRegistered[serviceId]`
marker) so a service Id is eligible once regardless of multisig rotation.

### 2. RegistryTracker accepts a disabled staking instance

**Severity**: Low
**Source**: internal review

`RegistryTracker.registerServiceMultisig` verifies the staking instance only by a nonzero implementation:

```solidity
IStaking.InstanceParams memory instanceParams = IStaking(stakingFactory).mapInstanceParams(stakingInstance);
if (instanceParams.implementation == address(0)) {
    revert WrongStakingInstance(stakingInstance);
}
```

`StakingFactory.setInstanceStatus` disables an instance by flipping `isEnabled` while leaving
`implementation` set, so a disabled instance still passes this check. `StakingFactory.verifyInstance(instance)`
— which does return `false` for a disabled instance — is not used. A service staked before disablement can
therefore register after disablement and be marked eligible.

Same eligibility-oracle bound as entry 1 (off-chain campaign payout only, no on-chain funds at risk).

**Mitigation.** On a future RegistryTracker revision, call `StakingFactory.verifyInstance(stakingInstance)`
(or additionally check `instanceParams.isEnabled`) instead of the bare implementation check. Off-chain, the
campaign can exclude disabled instances in the interim.

### 3. `DualStakingToken.restake` discards the base staking reward

**Severity**: Low
**Source**: internal review

`DualStakingToken.restake()` recovers an `Evicted` service by calling the base unstake, but discards the
returned reward and never runs the second-token conversion:

```solidity
// restake(): the returned reward is ignored, no _claim()
IStaking(stakingInstance).unstake(serviceId);
...
IStaking(stakingInstance).stake(serviceId);
```

whereas `unstake()` captures it: `uint256 reward = IStaking(...).unstake(serviceId); if (reward > 0)
_claim(multisig, reward);`. The base `StakingBase.unstake` still returns the accrued reward (and pays and
clears it), so if an evicted service had accrued a positive OLAS reward, the adapter's second-token
conversion for it is lost when the service is re-staked. Because `restake` is the only path that keeps the
service in dual-staking after eviction (`unstake` withdraws it entirely), a staker who wants to continue is
forced to forfeit the conversion.

This is a loss of the staker's **own** derived second-token reward — there is no third-party loss and no
protocol drain, and a staker can `unstake` (which does convert) and re-stake manually as a workaround.

**Mitigation.** On a future DualStakingToken revision, capture the reward returned by the base `unstake` in
`restake()` and run `_claim(multisig, reward)` before re-staking, mirroring `unstake()`.

### 4. `DualStakingToken.unstake` clears the activity marker before the base checkpoint

**Severity**: Low
**Source**: internal review

`DualStakingToken.unstake()` clears the multisig activity marker before delegating to the base:

```solidity
mapActiveMutisigAttestations[multisig] &= ((1 << 255) - 1);   // activity bit cleared first
...
uint256 reward = IStaking(stakingInstance).unstake(serviceId); // base checkpoints, then reads the marker
```

The base `StakingBase._unstake` checkpoints first (`_checkpoint()` at the top of `_unstake`), and
`DualStakingTokenActivityChecker` reads the now-cleared marker and rejects the current period's activity.
A service with genuine activity that unstakes without a prior checkpoint therefore loses its pending
current-period OLAS reward and the derived second-token reward.

This is a loss of the staker's **own** reward; there is no third-party loss or protocol drain, and calling
`checkpoint()` before `unstake()` is a workaround.

**Mitigation.** On a future DualStakingToken revision, clear the activity marker **after** the base
unstake/checkpoint (or checkpoint before clearing), so the pending period is credited first.


### 5. RequesterActivityChecker (V1) under-counts requests not backed one-for-one by Safe nonce growth

**Severity**: Low
**Source**: internal review

The V1 `RequesterActivityChecker` reports `[Safe nonce, mapRequestCounts(requester)]` and requires the
request-count delta to be backed by the requester Safe's nonce growth — in effect assuming **one request per
Safe transaction**. Any legitimate flow that breaks that one-for-one relationship fails the ratio check at
checkpoint time, withholding staking rewards and accruing inactivity toward eviction for a requester staking
instance configured with V1. Two such flows exist:

- **Signed delivery.** The mech operator settles authenticated requests without executing the requester
  Safe, so `mapRequestCounts` advances while the Safe nonce does not.
- **Batched requests.** A Safe-backed `requestBatch()` legitimately creates several requests in a single
  transaction, so the request count advances by *n* while the nonce advances by one.

Both are the same defect — the nonce is not a proxy for request volume — and neither involves any
misbehaviour by the requester.

**This is superseded and not in use.** `RequesterActivityCheckerV2` deliberately drops the nonce-backing
requirement — the requests count alone determines the activity signal — and is the checker used by the
current requester staking programmes; V1 is retained only for historical/reference purposes and is not
configured on live instances. There is no fund loss in any case (only a requester's own reward accrual is
affected), and the resolution is simply to use V2, which the protocol already does.

### 6. MechActivityChecker under-counts batched signed deliveries

**Severity**: Low
**Source**: internal review

`MechActivityChecker` reports `[Safe nonce, mapMechServiceDeliveryCounts(multisig)]` and enforces
`(cur[1] - last[1]) <= (cur[0] - last[0])` — every delivery-count increment must be backed by a service-Safe
nonce increment. A mech that batches N signed deliveries in one `deliverMarketplaceWithSignatures` call
increments the delivery count by N while its service Safe nonce advances once, so the check fails and the
mech records inactivity (and could eventually be evicted).

This is a **liveness/usability** property, not a profitable attack: it only causes a mech's *own* activity to
be under-counted, there is no fund gain, and delivering one request per Safe transaction (rather than
batching) satisfies the check. The nonce-backing constraint is the intended anti-inflation guard behind
item 7 — relaxing it would re-open self-generated count inflation — so it is a deliberate trade-off. A future
`MechActivityChecker` revision could credit batched signed deliveries without weakening that guard.

### 7. Activity liveness KPIs can be satisfied by self-generated mech usage

**Severity**: Low
**Source**: internal review

The staking liveness KPI rewards a service for on-chain mech usage above a threshold
(`ratio >= livenessRatio`). Because genuine and self-generated usage are indistinguishable on-chain, a
service owner can satisfy the KPI with their own activity: create a `1 wei` fixed-price mech and
self-request/self-deliver (each a real Safe transaction that satisfies `MechActivityChecker`'s nonce-backing
guard), or, on the requester side under `RequesterActivityCheckerV2`, submit `1 wei` self-requests whose
count advances before delivery — then earn `StakingBase` emissions for negligible economic volume, recovering
the self-paid amounts.

**No profitable attack in the calibrated deployment.** The behaviour is the fundamental limitation of any
on-chain activity KPI, and it is bounded by: the staking **deposit** (locked and at risk while staked), the
**liveness threshold** (sustained activity is required every period), the **per-call gas**, and — decisively —
the staking programme's `rewardsPerSecond` **calibration**, which is set so that emissions reward genuine
participation rather than covering the cost of manufacturing activity. Services that are not genuinely active
are detectable and evictable through the off-chain liveness monitoring already run against the same KPI. It
is recorded as an accepted design property rather than an exploitable defect; the mitigation is calibration
plus monitoring, and, if ever needed, tightening `livenessRatio` / the staking parameters for a specific
programme.

### 8. Zero-rate delivery entries count toward mech activity

**Severity**: Low
**Source**: internal review

A mixed Nevermined delivery batch can include zero-rate entries that are still marked `Delivered` and counted
in `mapMechDeliveryCounts` / `mapMechServiceDeliveryCounts`, while only the positive-rate entry settles
payment. This lets delivery activity accrue with no per-entry payment — a cheaper input to the same
self-generated-activity property as item 7.

**No profitable attack beyond item 7's bound.** The requester is refunded for a zero-rate delivery, so no
requester funds are taken; the only effect is that activity can be produced slightly more cheaply, still
bounded by the deposit, threshold, gas and programme calibration described in item 7. A future revision could
decline to count zero-rate entries toward activity, or require a minimum delivery rate.

### 9. StakingAirdrop.claimAll strands a zero-multisig entitlement

**Severity**: Low
**Source**: internal review

`claimAll()` runs two loops. The first loop zeroes every funded entitlement (`mapServiceIdAirdropAmount[id]
= 0`) and accumulates the total. The second loop resolves each service's multisig and, if the service is
still in `PreRegistration`, the registry returns `address(0)`; that branch emits `ZeroMultisigAddress` and
`continue`s, skipping the transfer. Because the entitlement was already cleared in the first loop, that
allocation is left permanently stranded in the airdrop contract — it is neither paid out nor recoverable via
a later claim. The single-service `claim()` path instead reverts on the zero multisig, so only the batch path
strands.

**Impact is a self-stranding, not a theft.** The stranded amount belonged to that same service's own
allocation; no other recipient's funds are affected and nothing is diverted to an attacker. The fix is to
resolve the multisig and skip (without zeroing) before clearing the entitlement, so a not-yet-payable service
retains its claim for a later call. Applies before the airdrop is deployed; no live exposure today.

### 10. StakingAirdrop pays a terminated service's parked multisig

**Severity**: Low
**Source**: internal review

Neither `claim()` nor `claimAll()` checks the service state before paying: they resolve the service's
current multisig and transfer to it. A service that has been terminated (or otherwise parked) still resolves
to its Safe, so the airdrop pays that Safe regardless of whether the service is an active, eligible
participant at claim time.

**Bounded to the pre-funded per-service allocation.** Amounts are set by the funder via
`mapServiceIdAirdropAmount`, so a claim can never exceed what was explicitly allocated to that service; the
issue is only that eligibility is not re-checked at claim time. A future revision could gate the claim on the
service being in an eligible state (e.g. `Deployed`) rather than merely resolving a non-zero multisig.
Applies before the airdrop is deployed; no live exposure today.

### 11. Contributors existing-service stake path does not enforce the OLAS staking token

**Severity**: Low
**Source**: internal review

The `token == olas` staking-token check lives only on the create-and-stake path (in the shared parameter
check). The existing-service entry point `Contributors.stake(socialId, serviceId, stakingInstance)`
validates the multisig owner set and the service state, then stakes via `_stake` **without** verifying
`IStaking(stakingInstance).stakingToken() == olas`. A factory-verified native staking instance is therefore
accepted on this path, and `_unstake` then treats the native `terminate()` refund (paid to the proxy in the
native asset) as an OLAS amount and transfers that value out in OLAS.

**No live exposure; bounded even in principle.** The `IToken(olas).transfer(...)` reverts unless the proxy
independently holds pooled OLAS, and the deployed Contributors proxy holds none (the contribute programme is
deprecated). At worst the pattern swaps `D` of the native asset for `D` of OLAS, bounded by whatever OLAS the
proxy transiently holds. The fix is to enforce `stakingToken == olas` on the existing-service `stake()` path,
mirroring the create path, so a native instance can never be staked through Contributors.

### 12. RegistryTracker registration can revive a service past the inactivity eviction threshold

**Severity**: Low

`RegistryTracker.registerServiceMultisig()` reads `getStakingState()` **before** it forces `checkpoint()`.
The ordering matters: a service that has already crossed `maxInactivityDuration` but has not yet been
checkpointed is still reported as staked at the moment registration is evaluated. Registration then writes a
fresh tracker timestamp, and the checkpoint that follows reads the overdue interval as active — so the
service avoids eviction and is credited a reward window it should not have earned.

Nothing here is exclusive to an attacker: the service owner is rescuing their own service rather than taking
from an identified victim, and the cost falls on the emissions pool shared by honest stakers. The window is
bounded by one inactivity interval per occurrence, and it only opens when a service sits past the threshold
with no checkpoint yet — a state that arises routinely rather than one that has to be engineered.

**Mitigation.** Force `checkpoint()` before reading `getStakingState()` in `registerServiceMultisig()`, so
eviction is settled against the real elapsed interval before any tracker timestamp is written. Operationally,
checkpointing promptly closes the window in the meantime.

### 13. DualStakingToken applies a fixed second-token amount regardless of service size

**Severity**: Informational

`DualStakingToken` snapshots a single immutable `secondTokenAmount` derived from `minStakingDeposit` and
applies it to every service, while the underlying staking flow accepts service deposits and agent bonds **at
or above** that minimum. A service staking well above the minimum therefore posts the same fixed second-token
principal as a minimum-sized one, so the proportional-collateral relationship the dual-staking design implies
does not hold across the range.

No funds are at risk and no unbacked rewards are issued: the second token is collateral rather than a reward
input, the dual gate is never bypassed, and every service still posts at least the required amount. What is
absent is proportionality at the top of the range.

**Mitigation.** This is a design property rather than a defect, and changing it is a deliberate choice: scale
`secondTokenAmount` with the service's actual OLAS deposit rather than with the configured minimum, on any
future `DualStakingToken` revision. Until then, size `minStakingDeposit` with the understanding that the
second-token requirement does not grow with the services that stake above it.
