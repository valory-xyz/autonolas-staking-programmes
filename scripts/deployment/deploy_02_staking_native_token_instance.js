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
    const stakingParams = parsedData.stakingParams;
    const stakingNativeTokenAddress = parsedData.stakingNativeTokenAddress;
    const stakingFactoryAddress = parsedData.stakingFactoryAddress;

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

    // Get StakingFactory contract instance
    const stakingFactory = await ethers.getContractAt("StakingFactory", stakingFactoryAddress);
    // Get StakingToken implementation contract instance
    const stakingNativeToken = await ethers.getContractAt("StakingNativeToken", stakingNativeTokenAddress);

    // Transaction signing and execution
    console.log("2. EOA to deploy StakingNativeTokenInstance via the StakingFactory");
    console.log("You are signing the following transaction: StakingFactory.connect(EOA).createStakingInstance()");
    const gasPrice = ethers.utils.parseUnits(gasPriceInGwei, "gwei");
    const initPayload = stakingNativeToken.interface.encodeFunctionData("initialize", [stakingParams]);
    const result = await stakingFactory.createStakingInstance(stakingNativeTokenAddress, initPayload, { gasPrice });
    let res = await result.wait();
    // Get staking contract instance address from the event
    const stakingNativeTokenInstanceAddress = "0x" + res.logs[0].topics[2].slice(26);

    // Transaction details
    console.log("Contract deployment: StakingProxy");
    console.log("Contract address:", stakingNativeTokenInstanceAddress);
    console.log("Transaction:", result.hash);

    // Wait half a minute for the transaction completion
    await new Promise(r => setTimeout(r, 30000));

    // Writing updated parameters back to the JSON file
    parsedData.stakingNativeTokenInstanceAddress = stakingNativeTokenInstanceAddress;
    fs.writeFileSync(globalsFile, JSON.stringify(parsedData));

    // Contract verification
    if (parsedData.contractVerification) {
        const execSync = require("child_process").execSync;
        execSync("npx hardhat verify --constructor-args scripts/deployment/verify_02_staking_native_token_instance.js --network " + providerName + " " + stakingNativeTokenInstanceAddress, { encoding: "utf-8" });
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
