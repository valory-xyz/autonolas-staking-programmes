The following steps are necessary to run the static-audit script:

1. Source TESTNET_MNEMONIC variable
For example, take default from `hardhat.config.js`:
```
export TESTNET_MNEMONIC="velvet deliver grief train result fortune travel voice over subject subject staff nominee bone name"
```

2. Run the script
```
npx hardhat run scripts/audit_staking_setups/audit_setup.js
```