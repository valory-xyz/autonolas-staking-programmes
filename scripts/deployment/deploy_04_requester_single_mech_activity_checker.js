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
    const agentMechAddress = parsedData.agentMechAddress;
    const livenessRatio = parsedData.livenessRatio;

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
    console.log("4. EOA to deploy RequesterSingleMechActivityChecker");
    const gasPrice = ethers.utils.parseUnits(gasPriceInGwei, "gwei");
    const RequesterSingleMechActivityChecker = await ethers.getContractFactory("RequesterSingleMechActivityChecker");
    console.log("You are signing the following transaction: RequesterSingleMechActivityChecker.connect(EOA).deploy()");
    const requesterSingleMechActivityChecker = await RequesterSingleMechActivityChecker.connect(EOA).deploy(agentMechAddress,
        livenessRatio, { gasPrice });
    const result = await requesterSingleMechActivityChecker.deployed();

    // Transaction details
    console.log("Contract deployment: RequesterSingleMechActivityChecker");
    console.log("Contract address:", requesterSingleMechActivityChecker.address);
    console.log("Transaction:", result.deployTransaction.hash);
    // Wait half a minute for the transaction completion
    await new Promise(r => setTimeout(r, 30000));

    // Writing updated parameters back to the JSON file
    parsedData.requesterSingleMechActivityCheckerAddress = requesterSingleMechActivityChecker.address;
    fs.writeFileSync(globalsFile, JSON.stringify(parsedData));

    // Contract verification
    if (parsedData.contractVerification) {
        const execSync = require("child_process").execSync;
        execSync("npx hardhat verify --constructor-args scripts/deployment/verify_04_requester_single_mech_activity_checker.js --network " + providerName + " " + requesterSingleMechActivityChecker.address, { encoding: "utf-8" });
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
