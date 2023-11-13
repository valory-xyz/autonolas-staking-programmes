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
- `serviceStakingParams`: a set of service staking parameters, which include:
  - `rewardsPerSecond`: amount of token (in wei) per second credited to a service if the service is active enough. Assuming the maximum
    number of reward per week is 1 OLAS (in ETH), then the reward per second is calculated by
    [this formula](https://www.wolframalpha.com/input?i=1+*+10%5E18+%2F+%283600+*+24+*+7%29);
  - `livenessRatio`: number of service multisig transactions per second (in 1e18 value) that are used to measure the service
    liveness (activity). In other words, it's the minimum number of transactions the service multisig needs to perform in order
    to pass the liveness check. Assuming the number of required tx-s per day is 10, the liveness ratio is calculated by
    [this formula](https://www.wolframalpha.com/input?i=%28115740740740740+*+60+*+60+*+24%29+%2F+10%5E18).

The script file name identifies the number of deployment steps taken from / to the number in the file name. For example:
- `deploy_01_service_staking_token_mech_usage.js` will complete step 1.

Export network-related API keys defined in `hardhat.config.js` file that correspond to the required network.

To run the script, use the following command:
`npx hardhat run scripts/deployment/script_name --network network_type`,
where `script_name` is a script name, i.e. `deploy_01_service_staking_token_mech_usage.js`, `network_type` is a network type corresponding to the `hardhat.config.js` network configuration.

## Validity checks and contract verification
Each script controls the obtained values by checking them against the expected ones. Also, each script has a contract verification procedure.
If a contract is deployed with arguments, these arguments are taken from the corresponding `verify_number_and_name` file, where `number_and_name` corresponds to the deployment script number and name.
