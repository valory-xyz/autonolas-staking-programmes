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
    const mechMarketplaceAddress = parsedData.mechMarketplaceAddress;
    const livenessRatio = parsedData.livenessRatio;

    let networkURL = parsedData.networkURL;
    const appendAlchemyKeyIfNeeded = (apiKeyName) => {
        if (!networkURL.endsWith("/v2/")) {
            return true;
        }
        if (!process.env[apiKeyName]) {
            console.log(`set ${apiKeyName} env variable`);
            return false;
        }
        networkURL += process.env[apiKeyName];
        return true;
    };

    if (providerName === "mainnet") {
        if (!appendAlchemyKeyIfNeeded("ALCHEMY_API_KEY_MAINNET")) {
            return;
        }
    } else if (providerName === "polygon") {
        if (!appendAlchemyKeyIfNeeded("ALCHEMY_API_KEY_MATIC")) {
            return;
        }
    } else if (providerName === "polygonAmoy") {
        if (!appendAlchemyKeyIfNeeded("ALCHEMY_API_KEY_AMOY")) {
            return;
        }
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
    console.log("5. EOA to deploy MechActivityChecker");
    const gasPrice = ethers.utils.parseUnits(gasPriceInGwei, "gwei");
    const MechActivityChecker = await ethers.getContractFactory("MechActivityChecker");
    console.log("You are signing the following transaction: MechActivityChecker.connect(EOA).deploy()");
    const mechActivityChecker = await MechActivityChecker.connect(EOA).deploy(mechMarketplaceAddress, livenessRatio,
        { gasPrice });
    const result = await mechActivityChecker.deployed();

    // Transaction details
    console.log("Contract deployment: MechActivityChecker");
    console.log("Contract address:", mechActivityChecker.address);
    console.log("Transaction:", result.deployTransaction.hash);
    // Wait half a minute for the transaction completion
    await new Promise(r => setTimeout(r, 30000));

    // Writing updated parameters back to the JSON file
    parsedData.mechActivityCheckerAddress = mechActivityChecker.address;
    fs.writeFileSync(globalsFile, JSON.stringify(parsedData));

    // Contract verification
    if (parsedData.contractVerification) {
        const execSync = require("child_process").execSync;
        execSync("npx hardhat verify --constructor-args scripts/deployment/verify_05_mech_activity_checker.js --network " + providerName + " " + mechActivityChecker.address, { encoding: "utf-8" });
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
