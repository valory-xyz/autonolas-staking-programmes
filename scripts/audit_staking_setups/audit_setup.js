/*global process*/

const { ethers } = require("hardhat");
const { expect } = require("chai");
const fs = require("fs");
const readline = require('readline');

async function main() {
    // TODO - take from tokenomics contract on L1
    const dispenserLimit = ethers.utils.parseEther("50000");

    // Read globals files from "files.txt"
    const fileStream = fs.createReadStream("scripts/audit_staking_setups/files.txt");
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    // Traverse globals configs and check the data
    for await (const configFile of rl) {
        const dataFromJSON = fs.readFileSync(configFile, "utf8");
        const params = JSON.parse(dataFromJSON);

        console.log("Verifying", configFile);

        // Check general params

        const stakingTokenAddress = params["stakingTokenInstanceAddress"];
        const isDeployed = stakingTokenAddress !== "";

        // Check on-chain setup for deployed contracts
        if (isDeployed) {
            // Get network and provider
            const networkURL = params["networkURL"];
            const provider = new ethers.providers.JsonRpcProvider(networkURL);

            // Get account and wallet
            const account = ethers.utils.HDNode.fromMnemonic(process.env.TESTNET_MNEMONIC).derivePath("m/44'/60'/0'/0/0");
            const wallet = new ethers.Wallet(account, provider);
            const stakingToken = await ethers.getContractAt("StakingToken", stakingTokenAddress, wallet);

            const activityChecker = await stakingToken.activityChecker();
            expect(activityChecker).to.equal(params["stakingParams"]["activityChecker"]);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
