# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Autonolas Staking Programmes — Solidity smart contracts for managing staking programs built on top of autonolas-registries service staking. Supports multi-chain deployments (Ethereum, Gnosis, Polygon, Arbitrum, Optimism, Base, Celo, Mode).

## Build & Test Commands

```bash
# Install dependencies
yarn install

# Compile contracts (Solidity 0.8.30, 1M optimizer runs, EVM target: prague)
npx hardhat compile

# Run all Hardhat tests
npx hardhat test

# Run a single Hardhat test file
npx hardhat test test/StakingContribute.js

# Run Foundry tests (--hh flag enables Hardhat compatibility)
forge test --hh -vvv

# Run a single Foundry test
forge test --hh -vvv --match-test testFunctionName

# Coverage
npx hardhat coverage

# Lint JS
./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx

# Lint Solidity
./node_modules/.bin/solhint contracts/p1/*.sol contracts/test/*.sol
```

## Architecture

### Contract Modules

- **`contracts/contribute/`** — Contributors staking system (UUPS proxy-upgradeable). `Contributors.sol` manages service creation/staking/unstaking/claims. `ContributeActivityChecker.sol` validates liveness via multisig nonce progression.
- **`contracts/mech_usage/`** — AI agent mech activity checkers. `MechActivityChecker.sol` tracks mech marketplace deliveries. `RequesterActivityChecker.sol` and `RequesterSingleMechActivityChecker.sol` are requester-based variants.
- **`contracts/registry_tracker/`** — Initial staking reward incentives with proxy pattern. `RegistryTracker.sol` + `RegistryTrackerProxy.sol`.
- **`contracts/externals/`** — `DualToken` (dual staking token system), `Backland` (quorum-based voting activity checker).
- **`contracts/airdrop/`** — `StakingAirdrop` contracts.
- **`contracts/interfaces/`** — Shared interfaces: `IStaking`, `IService`, `IToken`, `INFToken`, `IEAS`, `IErrors`.
- **`contracts/libraries/`** — `SafeTransferLib` (assembly-optimized ERC20 transfers).

### Key Design Patterns

- **UUPS Proxy**: ContributorsProxy uses delegatecall for upgradeability
- **Activity Checker Pattern**: Modular liveness verification — each staking variant has its own checker implementing a common interface
- **CEI (Checks-Effects-Interactions)**: Enforced throughout to prevent reentrancy

### Testing

- **Hardhat tests** (`test/*.js`): Use ethers.js v5 + Chai assertions
- **Foundry tests** (`test/*.t.sol`): Use forge-std, `BaseSetup` contract for shared test infrastructure
- **Mock contracts** in `contracts/test/`: ERC20Token, MockAgentMech, MockEAS, MockServiceRegistryMap

### Deployment

Numbered scripts in `scripts/deployment/` (deploy_01 through deploy_20). Each script targets a specific contract. Configuration via `globals_<network>.json` files. Supports Ledger hardware wallet signing.

#### Legacy folders

- **`scripts/deployment/legacy_deployment_scripts/`** — Archived `globals_*.json` config files for staking contracts that have been removed from VoteWeighting (unnominated). These are no longer active but kept for historical reference.
- **`scripts/deployment/legacy_js_scripts/`** — Old Hardhat JS deployment scripts replaced by newer shell-based (`*.sh`) equivalents.

#### Cleanup script: `move_unnominated_to_legacy.py`

`scripts/deployment/move_unnominated_to_legacy.py` automates archival of obsolete deployment configs. It scans `RemoveNominee` events from the VoteWeighting contract on Ethereum mainnet, then moves any `globals_*.json` file whose `stakingTokenInstanceAddress` matches a removed nominee into `legacy_deployment_scripts/`. Requires `ETHERSCAN_API_KEY` env var and Python packages `web3` and `requests`.

```bash
ETHERSCAN_API_KEY=<key> python scripts/deployment/move_unnominated_to_legacy.py
```

### Dependencies

Git submodules in `lib/` (autonolas-registries, solmate, forge-std). Checkout with `--recurse-submodules`.

## Code Style

- **JS**: 4-space indent, double quotes, semicolons required, camelCase enforced (ESLint)
- **Solidity**: solhint:recommended, compiler ≥0.8.21, custom errors over string reverts, NatSpec on public/external functions
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
