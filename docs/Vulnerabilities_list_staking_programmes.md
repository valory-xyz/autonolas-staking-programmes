# Contracts vulnerabilities

## Vulnerabilities list

- [Involved contracts and level of the bugs](#involved-contracts-and-level-of-the-bugs)
- [Vulnerabilities](#vulnerabilities)
    - [1. RegistryTracker registration replay is keyed by multisig, not service Id](#1-registrytracker-registration-replay-is-keyed-by-multisig-not-service-id)
    - [2. RegistryTracker accepts a disabled staking instance](#2-registrytracker-accepts-a-disabled-staking-instance)
    - [3. DualStakingToken.restake discards the base staking reward](#3-dualstakingtokenrestake-discards-the-base-staking-reward)
    - [4. DualStakingToken.unstake clears the activity marker before the base checkpoint](#4-dualstakingtokenunstake-clears-the-activity-marker-before-the-base-checkpoint)

## Involved contracts and level of the bugs

This document records known issues in the `autonolas-staking-programmes` contracts — deliberately
unfixed design trade-offs and accepted risks, each paired with its operational or contract-level
mitigation. Entries here are found in the current `main` sources.

| Contract | Level |
|---|---|
| RegistryTracker | Low |
| DualStakingToken | Low |

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
