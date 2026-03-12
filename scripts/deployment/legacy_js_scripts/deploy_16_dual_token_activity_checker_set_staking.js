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
    const dualStakingTokenActivityCheckerAddress = parsedData.dualStakingTokenActivityCheckerAddress;
    const dualStakingTokenAddress = parsedData.dualStakingTokenAddress;

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
    console.log("16. EOA to set DualStakingToken in DualStakingTokenActivityChecker");
    const gasPrice = ethers.utils.parseUnits(gasPriceInGwei, "gwei");
    const dualStakingTokenActivityChecker = await ethers.getContractAt("DualStakingTokenActivityChecker", dualStakingTokenActivityCheckerAddress);
    console.log("You are signing the following transaction: DualStakingTokenActivityChecker.connect(EOA).setDualStakingToken()");
    const result = await dualStakingTokenActivityChecker.connect(EOA).setDualStakingToken(dualStakingTokenAddress, { gasPrice });

    // Transaction details
    console.log("Contract deployment: DualStakingTokenActivityChecker");
    console.log("Contract address:", dualStakingTokenActivityChecker.address);
    console.log("Transaction:", result.hash);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
