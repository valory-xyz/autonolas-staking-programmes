/*global process*/

const { ethers } = require("hardhat");
const { expect } = require("chai");
const fs = require("fs");
const readline = require("readline");

// Custom expect that is wrapped into try / catch block
function customExpect(arg1, arg2, log) {
    try {
        expect(arg1).to.equal(arg2);
    } catch (error) {
        console.log(log);
        if (error.status) {
            console.error(error.status);
            console.log("\n");
        } else {
            console.error(error);
            console.log("\n");
        }
    }
}

async function main() {
    // TODO - take from tokenomics contract on L1
    const dispenserLimit = ethers.utils.parseEther("50000");

    // Read globals files from "files.txt"
    const fileStream = fs.createReadStream("scripts/audit_staking_setups/files.txt");
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const execSync = require("child_process").execSync;
    try {
        execSync("scripts/audit_staking_setups/run.sh");
    } catch (error) {
        console.log("Error in running files search script");
        return;
    }

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

            const log = "Contract " + stakingTokenAddress + ", chain: " + params["providerName"];
            const metadataHash = await stakingToken.metadataHash();
            customExpect(metadataHash, params["stakingParams"]["metadataHash"], log + ", metadataHash");
            const minStakingDeposit = await stakingToken.minStakingDeposit();
            customExpect(minStakingDeposit, params["stakingParams"]["minStakingDeposit"], log + ", minStakingDeposit");

            const rewardsPerSecond = await stakingToken.rewardsPerSecond();
            customExpect(rewardsPerSecond, params["stakingParams"]["rewardsPerSecond"], log + ", rewardsPerSecond");
            const maxNumServices = await stakingToken.maxNumServices();
            customExpect(maxNumServices, params["stakingParams"]["maxNumServices"], log + ", maxNumServices");
            const timeForEmissions = await stakingToken.timeForEmissions();
            customExpect(timeForEmissions, params["stakingParams"]["timeForEmissions"], log + ", timeForEmissions");
            const emissionsAmount = rewardsPerSecond.mul(maxNumServices).mul(timeForEmissions);
            expect(emissionsAmount).lte(dispenserLimit);

            const livenessPeriod = await stakingToken.livenessPeriod();
            customExpect(livenessPeriod, params["stakingParams"]["livenessPeriod"], log + ", livenessPeriod");
            const minNumStakingPeriods = params["stakingParams"]["minNumStakingPeriods"];
            const minStakingDuration = await stakingToken.minStakingDuration();
            customExpect(minStakingDuration, minNumStakingPeriods * livenessPeriod, log + ", minStakingDuration");
            const maxNumInactivityPeriods = params["stakingParams"]["maxNumInactivityPeriods"];
            const maxInactivityDuration = await stakingToken.maxInactivityDuration();
            customExpect(maxInactivityDuration, maxNumInactivityPeriods * livenessPeriod, log + ", maxInactivityDuration");

            const numAgentInstances = await stakingToken.numAgentInstances();
            customExpect(numAgentInstances, params["stakingParams"]["numAgentInstances"], log + ", numAgentInstances");
            const agentId = await stakingToken.agentIds(0);
            customExpect(agentId, params["stakingParams"]["agentIds"][0], log + ", agentIds");
            const threshold = await stakingToken.threshold();
            customExpect(threshold, params["stakingParams"]["threshold"], log + ", threshold");
            const configHash = await stakingToken.configHash();
            customExpect(configHash, params["stakingParams"]["configHash"], log + ", configHash");
            const proxyHash = await stakingToken.proxyHash();
            customExpect(proxyHash, params["stakingParams"]["proxyHash"], log + ", proxyHash");
            const serviceRegistry = await stakingToken.serviceRegistry();
            customExpect(serviceRegistry, params["stakingParams"]["serviceRegistry"], log + ", serviceRegistry");

            const activityCheckerAddress = await stakingToken.activityChecker();
            customExpect(activityCheckerAddress, params["stakingParams"]["activityChecker"], log + ", activityChecker");
            const activityChecker = await ethers.getContractAt("RequesterActivityChecker", activityCheckerAddress, wallet);
            const livenessRatio = await activityChecker.livenessRatio();
            customExpect(livenessRatio, params["livenessRatio"], log + ", livenessRatio");
        } else {
            const rewardsPerSecond = ethers.BigNumber.from(params["stakingParams"]["rewardsPerSecond"]);
            const maxNumServices = ethers.BigNumber.from(params["stakingParams"]["maxNumServices"]);
            const timeForEmissions = ethers.BigNumber.from(params["stakingParams"]["timeForEmissions"]);
            const emissionsAmount = rewardsPerSecond.mul(maxNumServices).mul(timeForEmissions);
            expect(emissionsAmount).lte(dispenserLimit);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
