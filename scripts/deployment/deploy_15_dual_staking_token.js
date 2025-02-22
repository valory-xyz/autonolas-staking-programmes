/*global process*/

const { ethers } = require("hardhat");
const { LedgerSigner } = require("@anders-t/ethers-ledger");

async function main() {
    const fs = require("fs");
    const globalsFile = "globals.json";
    const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
    let parsedData = JSON.parse(dataFromJSON);
    const useLedger = parsedData.useLedger;
    const derivationPath = parsedData.derivationPath;
    const providerName = parsedData.providerName;
    const gasPriceInGwei = parsedData.gasPriceInGwei;
    const serviceRegistryAddress = parsedData.serviceRegistryAddress;
    const secondTokenAddress = parsedData.secondTokenAddress;
    const stakingTokenInstanceAddress = parsedData.stakingTokenInstanceAddress;
    const rewardRatio = parsedData.rewardRatio;

    let networkURL = parsedData.networkURL;
    if (providerName === "polygon") {
        if (!process.env.ALCHEMY_API_KEY_MATIC) {
            console.log("set ALCHEMY_API_KEY_MATIC env variable");
        }
        networkURL += process.env.ALCHEMY_API_KEY_MATIC;
    } else if (providerName === "polygonAmoy") {
        if (!process.env.ALCHEMY_API_KEY_AMOY) {
            console.log("set ALCHEMY_API_KEY_AMOY env variable");
            return;
        }
        networkURL += process.env.ALCHEMY_API_KEY_AMOY;
    }

    const provider = new ethers.providers.JsonRpcProvider(networkURL);
    const signers = await ethers.getSigners();

    let EOA;
    if (useLedger) {
        EOA = new LedgerSigner(provider, derivationPath);
    } else {
        EOA = signers[0];
    }
    // EOA address
    const deployer = await EOA.getAddress();
    console.log("EOA is:", deployer);

    // Transaction signing and execution
    console.log("15. EOA to deploy DualStakingToken");
    console.log("You are signing the following transaction: DualStakingToken.connect(EOA).deploy()");
    const gasPrice = ethers.utils.parseUnits(gasPriceInGwei, "gwei");
    const DualStakingToken = await ethers.getContractFactory("DualStakingToken");
    const dualStakingToken = await DualStakingToken.connect(EOA).deploy(serviceRegistryAddress, secondTokenAddress,
        stakingTokenInstanceAddress, rewardRatio, { gasPrice });
    const result = await dualStakingToken.deployed();

    // Transaction details
    console.log("Contract deployment: DualStakingToken");
    console.log("Contract address:", dualStakingToken.address);
    console.log("Transaction:", result.deployTransaction.hash);

    // Wait for half a minute for the transaction completion
    await new Promise(r => setTimeout(r, 30000));

    // Writing updated parameters back to the JSON file
    parsedData.dualStakingTokenAddress = dualStakingToken.address;
    fs.writeFileSync(globalsFile, JSON.stringify(parsedData));

    // Contract verification
    if (parsedData.contractVerification) {
        const execSync = require("child_process").execSync;
        execSync("npx hardhat verify --constructor-args scripts/deployment/verify_15_dual_staking_token.js --network " + providerName + " " + dualStakingToken.address, { encoding: "utf-8" });
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
