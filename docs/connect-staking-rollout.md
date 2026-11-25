# Connect staking programmes

Five deployed StakingToken v0.4.0 programmes, with 44 service slots each. The tiers
match Omenstrat so Gnosis stakers can choose Connect at the corresponding deposit
level. Programme numbering starts at I independently on each chain.

| Chain | Programme | Config | Minimum deposit, OLAS | Total user requirement, OLAS |
|---|---|---|---:|---:|
| Gnosis (100) | Connect I | `globals_gnosis_mainnet_connect1.json` | 2,500 | 5,000 |
| Gnosis (100) | Connect II | `globals_gnosis_mainnet_connect2.json` | 5,000 | 10,000 |
| Robinhood (4663) | Connect I | `globals_robinhood_mainnet_connect1.json` | 50 | 100 |
| Robinhood (4663) | Connect II | `globals_robinhood_mainnet_connect2.json` | 2,500 | 5,000 |
| Robinhood (4663) | Connect III | `globals_robinhood_mainnet_connect3.json` | 5,000 | 10,000 |

The total user requirement follows the existing programmes' service deposit plus
agent bond. Rewards per second and all shared staking parameters are copied from
the corresponding 50 / 2,500 / 5,000 OLAS Omenstrat configs on main. Each programme
uses one agent instance, Connect agent ID **116**, three minimum staking periods,
two maximum inactivity periods, an 86,400-second liveness period and a
2,592,000-second emissions horizon. The Safe proxy hash, zero config hash and
threshold follow those existing programmes. Descriptions name Connect and state
the total user requirement.

## Marketplace activity

Use `RequesterActivityCheckerV2`, which measures increases in the marketplace's
`mapRequestCounts(serviceSafe)`. The liveness ratio is **11337868480725**, matching
the existing Omenstrat programmes. At an elapsed time of 86,400 seconds, one
request-count increment passes; the Safe nonce need not increase. Off-chain
requests must reach settlement and increment the on-chain counter to count.

Gnosis reuses the existing V2 checker:

- Checker: `0x3514EeA47C03dF8d9FdD68A469908755d2870c48`.
- Marketplace: `0x735FAAb1c4Ec41128c367AFb5c3baC73509f70bB`.

Robinhood uses **one deployed shared checker** for all three programmes:

- Checker: `0x8d790f3ac75fD9c0F7fdB84fd09FE8CF7D0dBB6B`.
- Contract: `contracts/mech_usage/RequesterActivityCheckerV2.sol:RequesterActivityCheckerV2`.
- Constructor marketplace: `0xa45E64d13A30a51b91ae0eb182e88a40e9b18eD8`.
- Constructor liveness ratio: `11337868480725`.

Both `requesterActivityCheckerAddress` and `stakingParams.activityChecker` contain
this verified address in all three Robinhood configs. The checker reports VERSION
`0.2.0`; the staking implementations report VERSION `0.4.0`. Its deployed runtime
matches the reviewed build byte for byte, and the marketplace, liveness ratio and
zero/one-request boundary checks passed. Source verification returned
[`exact_match` on Sourcify](https://sourcify.dev/server/v2/verify/0d1e94c0-b423-4da4-8dd7-f70f01a0b879).
The Blockscout API verification attempt was blocked by a Cloudflare challenge.
The checker was deployed in transaction
[`0x73e7852a22c1c6983aca0b8d3ff6c2251df520b489e8bde9eae416b82a1e079e`](https://robinhoodchain.blockscout.com/tx/0x73e7852a22c1c6983aca0b8d3ff6c2251df520b489e8bde9eae416b82a1e079e),
at Robinhood block **122,958,725**. No additional checker deployment is needed.

## Metadata

`metadata/connect/` contains the exact compact UTF-8 JSON bytes used to calculate
each config's metadata hash: `{"name":...,"description":...}`, with no trailing
newline. The digest is the SHA-256 part of a CIDv0 UnixFS dag-pb file, matching
Launch's metadata format. The same calculation reproduces all 12 metadata hashes
in the previously deployed PR #168 programmes.

All five metadata files were retrieved from the IPFS gateway after deployment on
25 November 2026, and their bytes matched these files exactly. Their on-chain
metadata hashes match the configs. If a name or description changes, regenerate the
corresponding hash. Do not substitute a formatted or newline-terminated file while
retaining the old digest.

## Deployments — 25 November 2026

| Chain | Programme | Staking instance | Deployment block |
|---|---|---|---:|
| Gnosis | Connect I | [`0xe09B0b884A0d483f52BE854CdaaA59e0150bF9c2`](https://gnosisscan.io/address/0xe09B0b884A0d483f52BE854CdaaA59e0150bF9c2) | 49,459,887 |
| Gnosis | Connect II | [`0xC6860D6127fa605403f1567513D9c6ebfB8A278A`](https://gnosisscan.io/address/0xC6860D6127fa605403f1567513D9c6ebfB8A278A) | 49,459,951 |
| Robinhood | Connect I | [`0x228DC61b838D6eD82347a93aA2cd3e28544808Ea`](https://robinhoodchain.blockscout.com/address/0x228DC61b838D6eD82347a93aA2cd3e28544808Ea) | 122,964,934 |
| Robinhood | Connect II | [`0x009Cda4D71c56Db6A1bac850483DB8E01D32884E`](https://robinhoodchain.blockscout.com/address/0x009Cda4D71c56Db6A1bac850483DB8E01D32884E) | 122,968,751 |
| Robinhood | Connect III | [`0x7Bb72fa48b274672Cb6A362045cdCf470aEe99b2`](https://robinhoodchain.blockscout.com/address/0x7Bb72fa48b274672Cb6A362045cdCf470aEe99b2) | 122,969,851 |

Each successful deployment receipt and factory event was checked against the
expected deployer, implementation and exact config-derived calldata. Independent
on-chain reads matched all staking parameters, the complete agent-ID array,
registry, token utility, OLAS token and activity checker. Both staking
implementations report VERSION `0.4.0`.

## Validation and remaining rollout

Read-only checks on 24 November 2026 confirmed:

- Gnosis block 49,446,837: the reused checker reports VERSION `0.2.0`, the
  expected marketplace and ratio; its view call passes one request in 86,400
  seconds with no Safe-nonce change.
- Robinhood block 122,330,334: the v0.4.0 staking implementation is allowed by
  the verifier; the service limit is 44 and minimum-deposit limit is 10,000 OLAS.
- Ethereum block 26,485,927: the current Dispenser has a nonzero Robinhood
  deposit processor (`0xb9dfcc6155ba4f211dcf8e6ecc9976be11bb7a77`).

Predeployment validation passed five local config checks and two live Gnosis
checker checks, with zero mismatches, warnings or errors. Read-only factory
creation simulations for both Gnosis configs passed at block 49,446,987. After
the Robinhood checker deployment, all three Robinhood factory creation
simulations passed against its actual deployed code, without state overrides.
All five staking instance addresses are now recorded in the configs.

The combined postdeployment static audit on 25 November 2026 passed **five
on-chain staking checks and five activity-checker checks**, with **zero
mismatches, warnings, errors or skips**. With dependencies and Hardhat artifacts
available, run the same auditor from the repository root:

```sh
node scripts/audit_staking_setups/audit_setup.js \
  --config scripts/deployment/globals_gnosis_mainnet_connect1.json \
  --config scripts/deployment/globals_gnosis_mainnet_connect2.json \
  --config scripts/deployment/globals_robinhood_mainnet_connect1.json \
  --config scripts/deployment/globals_robinhood_mainnet_connect2.json \
  --config scripts/deployment/globals_robinhood_mainnet_connect3.json
```

Before offering these programmes to users:

1. Complete the final review of these deployments and their audit results.
2. Nominate them on the existing Ethereum VoteWeighting, review the expanded
   voting/funding plan, and verify rewards delivery.
3. Verify Connect staking support and these programme addresses in Pearl. The
   pinned predeployment Pearl revision below specifies `no_staking`, and Connect's
   staking service methods are stubs in that revision. Contract deployment alone does not enable the
   switching flow. These configs restrict agent ID 116; they do not make an old
   Omenstrat service with agent ID 25 eligible as a Connect service.

Deployment is complete. Nomination, voting, rewards delivery and the Pearl
switching flow remain separate rollout steps.

## Pinned sources

- Existing tiers: staking-programmes main
  `9d539b2ec888ca14db3fdd37a9b049594ff909d2`,
  `scripts/deployment/globals_gnosis_mainnet_omenstrat8.json`, `omenstrat9.json`,
  `omenstrat10.json`.
- Robinhood registry deployment: autonolas-registries main
  `9a3442ad6e3379aed2c199ccaca8c1583416d6e7`,
  `scripts/deployment/l2/globals_robinhood_mainnet.json`.
- Robinhood marketplace deployment: ai-registry-mech main
  `946eade0ce561e005636b9b68573b594c339b7e1`,
  `scripts/deployment/globals_robinhood_mainnet.json`.
- Connect identity and current staking support: olas-operate-app main
  `57e083f8341be4ea21aa7a05a9be39478835d595`,
  `frontend/constants/serviceTemplates/service/connect.ts` and
  `frontend/service/agents/Connect.ts`.
- Connect marketplace requester behavior: connect main
  `00acdd34006f5add5bf2eec3f13d032fdf2c9637`, `connect/mech.py` and
  `connect/chains.py`.
