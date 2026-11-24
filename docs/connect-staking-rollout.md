# Connect staking programmes

Five proposed StakingToken v0.4.0 programmes, with 44 service slots each. The tiers
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

Robinhood needs a compatible checker on Robinhood. Deploy **one shared checker**
for all three programmes, using the existing contract and deployment tooling:

- Contract: `contracts/mech_usage/RequesterActivityCheckerV2.sol:RequesterActivityCheckerV2`.
- Constructor marketplace: `0xa45E64d13A30a51b91ae0eb182e88a40e9b18eD8`.
- Constructor liveness ratio: `11337868480725`.

The Robinhood `requesterActivityCheckerAddress` and
`stakingParams.activityChecker` fields are deliberately empty pending that
deployment. Set both fields to the same verified checker address in all three
configs before creating any Robinhood staking instance. The existing
`deploy_06_requester_activity_checker_v2.sh` updates only the selected file's
top-level checker field, so the remaining fields still need updating afterwards.

## Metadata

`metadata/connect/` contains the exact compact UTF-8 JSON bytes used to calculate
each config's metadata hash: `{"name":...,"description":...}`, with no trailing
newline. The digest is the SHA-256 part of a CIDv0 UnixFS dag-pb file, matching
Launch's metadata format. The same calculation reproduces all 12 metadata hashes
in the previously deployed PR #168 programmes.

These files and hashes are prepared locally; their content has **not been
published or pinned to IPFS by this PR preparation**. Publish each exact file and
verify the returned CID/digest and gateway content before launch. If a name or
description changes, regenerate the corresponding hash. Do not substitute a
formatted or newline-terminated file while retaining the old digest.

## Validation and remaining rollout

Read-only checks on 24 November 2026 confirmed:

- Gnosis block 49,446,837: the reused checker reports VERSION `0.2.0`, the
  expected marketplace and ratio; its view call passes one request in 86,400
  seconds with no Safe-nonce change.
- Robinhood block 122,330,334: the v0.4.0 staking implementation is allowed by
  the verifier; the service limit is 44 and minimum-deposit limit is 10,000 OLAS.
- Ethereum block 26,485,927: the current Dispenser has a nonzero Robinhood
  deposit processor (`0xb9dfcc6155ba4f211dcf8e6ecc9976be11bb7a77`).

Validation of this draft passed five local config checks and two live Gnosis
checker checks, with zero mismatches, warnings or errors. Read-only factory
creation simulations for both Gnosis configs also passed at block 49,446,987.
All five staking instance address fields remain empty. These checks do not
establish an on-chain 1:1 audit of undeployed instances. Robinhood checker checks
and factory creation simulations remain pending its checker deployment.

Before offering these programmes to users:

1. Publish and verify the metadata, and deploy/verify the shared Robinhood
   activity checker and update all six Robinhood checker address fields.
2. Deploy the five staking proxies, record their addresses and run the full
   on-chain static audit against their configs.
3. Nominate them on the existing Ethereum VoteWeighting, review the expanded
   voting/funding plan, and verify rewards delivery.
4. Add Connect staking support and these programme addresses to Pearl. Its
   current main template still specifies `no_staking`, and Connect's staking
   service methods are stubs. Contract deployment alone does not enable the
   switching flow. These configs restrict agent ID 116; they do not make an old
   Omenstrat service with agent ID 25 eligible as a Connect service.

No blockchain transactions are part of this config PR.

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
