# Deployment scripts

This folder contains the scripts to deploy the contracts.

## Observations
- There are several files with global parameters based on the corresponding network. In order to work with the configuration, please copy `gobals_network.json` file to file the `gobals.json` one, where `network` is the corresponding network. For example: `cp gobals_gnosis.json gobals.json`.
- Please note: if you encounter the `Unknown Error 0x6b0c`, then it is likely because the ledger is not connected or logged in.

## Steps to engage
The project has submodules to get the dependencies. Make sure you run `git clone --recursive` or init the submodules yourself.
The dependency list is managed by the `package.json` file, and the setup parameters are stored in the `hardhat.config.js` file.
Simply run the following command to install the project:
```
yarn install
```
command and compiled with the
```
npx hardhat compile
```

Create a `globals.json` file in the root folder, or copy it from the file with pre-defined parameters (i.e., `scripts/deployment/globals_gnosis_mainnet.json` for the gnosis mainnet network).

Parameters of the `globals.json` file:
- `contractVerification`: a flag for verifying contracts in deployment scripts (`true`) or skipping it (`false`);
- `useLedger`: a flag whether to use the hardware wallet (`true`) or proceed with the seed-phrase accounts (`false`);
- `derivationPath`: a string with the derivation path;
- `providerName`: a network type (see `hardhat.config.js` for the network configurations);
- `networkURL`: a network RPC URL;
- `agentMechAddress`: an agent mech address;
- `livenessRatio`: number of service multisig transactions per second (with 18 decimals) that are used to measure the service
    liveness (activity). In other words, it's the minimum number of transactions the service multisig needs to perform in order
    to pass the liveness check. To check this `rewardsPerSecond* livenessPeriod/1e18` should approximate the number of txs required per livenessPeriod.
    Assuming the number of required tx-s per day is 10, the liveness ratio can be checked by means of [this formula](https://www.wolframalpha.com/input?i=%28115740740740740+*+60+*+60+*+24%29+%2F+10%5E18);
- `stakingActivityCheckerAddress`: a basic activity checker contract address that uses only the `livenessRatio` value;
- `singleMechActivityCheckerAddress`: a mech activity checker contract address that uses `agentMechAddress` and `livenessRatio` values;
- `mechActivityCheckerAddress`: a mech activity checker contract address that uses deliveries of `mechMarketplaceAddress` and `livenessRatio` values;
- `requesterActivityCheckerAddress`: a mech activity checker contract address that uses requests of `mechMarketplaceAddress` and `livenessRatio` values;
- `stakingTokenAddress`: a staking token implementation address all the instances are created with when deploying a proxy staking contract;
- `stakingFactoryAddress`: a staking proxy factory that creates each proxy staking contract;
- `stakingParams`: a set of staking contract parameters used to initiate each staking proxy contract. See [here](https://github.com/valory-xyz/autonolas-registries/blob/main/docs/StakingSmartContracts.pdf) for more details.

The script file name identifies the number of deployment steps taken from / to the number in the file name. For example:
- `deploy_01_staking_token_instance.js` will complete step 1.

Export network-related API keys defined in `hardhat.config.js` file that correspond to the required network.

To run the script, use the following command:
`npx hardhat run scripts/deployment/script_name --network network_type`,
where `script_name` is a script name, i.e. `deploy_01_mech_activity_checker.js`, `network_type` is a network type corresponding to the `hardhat.config.js` network configuration.

Note: consider creating mech activity checker contract customized for specific needs, if the default one does not serve
the purpose for staking. Then, deploy staking proxy instances [here](https://launch.olas.network/).

## Validity checks and contract verification
Each script controls the obtained values by checking them against the expected ones. Also, each script has a contract verification procedure.
If a contract is deployed with arguments, these arguments are taken from the corresponding `verify_number_and_name` file, where `number_and_name` corresponds to the deployment script number and name.
