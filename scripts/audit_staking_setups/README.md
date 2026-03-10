The following steps are necessary to run the static-audit script:

1. Source `TESTNET_MNEMONIC` variable (optional if you use the default from `hardhat.config.js`):
```
export TESTNET_MNEMONIC="velvet deliver grief train result fortune travel voice over subject subject staff nominee bone name"
```

2. Run one of the commands below.

Default behavior (backward compatible):
```
npx hardhat run scripts/audit_staking_setups/audit_setup.js
```
This audits config files that:
- have `mainnet` in the filename;
- contain `stakingTokenInstanceAddress` field.

For configs where `stakingTokenInstanceAddress` is empty, the script still performs:
- local emissions limit check;
- on-chain `activityChecker` `livenessRatio` check when `stakingParams.activityChecker` is set.

Audit all configs recursively under `scripts/deployment`:
```
node scripts/audit_staking_setups/audit_setup.js --all
```

Audit a subset by path text and / or provider:
```
node scripts/audit_staking_setups/audit_setup.js --all --contains qs_beta_new_marketplace --provider gnosis
```

Audit a specific staking contract address:
```
node scripts/audit_staking_setups/audit_setup.js --contract 0x99Fe6B5C9980Fc3A44b1Dc32A76Db6aDfcf4c75e
```

Audit a specific config file:
```
node scripts/audit_staking_setups/audit_setup.js --config scripts/deployment/globals_gnosis_mainnet_qs_beta_new_marketplace_expert13.json
```

List selected files without running checks:
```
node scripts/audit_staking_setups/audit_setup.js --all --contains gnosis --list-only
```
