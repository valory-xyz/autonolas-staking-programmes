#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const WEI = 10n ** 18n;
const defaultConfigPath = path.join(
    __dirname,
    "globals_gnosis_mainnet_qs_beta_new_marketplace_expert13.json"
);

function formatWeiToOlas(weiValue) {
    const whole = weiValue / WEI;
    const fraction = weiValue % WEI;

    if (fraction === 0n) {
        return whole.toString();
    }

    const fractionRaw = fraction.toString().padStart(18, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fractionRaw}`;
}

function parseJsonFile(jsonPath) {
    try {
        const raw = fs.readFileSync(jsonPath, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        console.error(`Failed to read or parse JSON: ${jsonPath}`);
        console.error(error.message);
        process.exit(1);
    }
}

function asBigInt(value, label) {
    try {
        return BigInt(value);
    } catch (error) {
        console.error(`Invalid numeric value for ${label}: ${value}`);
        process.exit(1);
    }
}

function printUsage() {
    console.log(`Usage: node print_staking_google_doc_block.js [options] [file ...]

Options:
  -f, --file <path>   JSON file to scan and convert (can be repeated)
  -h, --help          Show this help

Examples:
  node print_staking_google_doc_block.js
  node print_staking_google_doc_block.js ./globals.json
  node print_staking_google_doc_block.js -f ./globals1.json -f ./globals2.json`);
}

function getInputPathsFromCli(args) {
    const inputPaths = [];

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];

        if (arg === "-h" || arg === "--help") {
            printUsage();
            process.exit(0);
        }

        if (arg === "-f" || arg === "--file") {
            const nextArg = args[i + 1];
            if (!nextArg || nextArg.startsWith("-")) {
                console.error(`Missing file path after ${arg}`);
                process.exit(1);
            }
            inputPaths.push(path.resolve(process.cwd(), nextArg));
            i += 1;
            continue;
        }

        if (arg.startsWith("-")) {
            console.error(`Unknown option: ${arg}`);
            printUsage();
            process.exit(1);
        }

        inputPaths.push(path.resolve(process.cwd(), arg));
    }

    if (inputPaths.length === 0) {
        return [defaultConfigPath];
    }

    return inputPaths;
}

function buildOutput(inputPath) {
    const data = parseJsonFile(inputPath);
    const stakingParams = data.stakingParams || {};

    const maxNumServices = stakingParams.maxNumServices ?? "";
    const rewardsPerSecondWei = asBigInt(stakingParams.rewardsPerSecond ?? "0", "rewardsPerSecond");
    const minStakingDepositWei = asBigInt(stakingParams.minStakingDeposit ?? "0", "minStakingDeposit");
    const minNumStakingPeriods = stakingParams.minNumStakingPeriods ?? "";
    const maxNumInactivityPeriods = stakingParams.maxNumInactivityPeriods ?? "";
    const livenessPeriodSeconds = stakingParams.livenessPeriod ?? "";
    const timeForEmissionsSeconds = stakingParams.timeForEmissions ?? "";
    const numAgentInstances = stakingParams.numAgentInstances ?? "";
    const agentIds = Array.isArray(stakingParams.agentIds) ? stakingParams.agentIds.join(", ") : "";
    const threshold = stakingParams.threshold ?? "";
    const configHash = stakingParams.configHash ?? "";
    const proxyHash = stakingParams.proxyHash ?? "";
    const activityChecker = stakingParams.activityChecker ?? "";
    const livenessRatioWei = asBigInt(data.livenessRatio ?? "0", "livenessRatio");

    const rewardPerSecond = formatWeiToOlas(rewardsPerSecondWei);
    const stakeWei = minStakingDepositWei * 2n;
    const minStakingDepositOlas = formatWeiToOlas(minStakingDepositWei);
    const stakeOlas = formatWeiToOlas(stakeWei);
    const livenessPeriodBigInt = asBigInt(stakingParams.livenessPeriod ?? "0", "livenessPeriod");
    const dailyKPI = (livenessRatioWei * livenessPeriodBigInt + (WEI - 1n)) / WEI;

    // Prefer explicit "name" field if present; fallback to filename without extension.
    const name = data.name || path.basename(inputPath, ".json");

    const output = [
        `Name: ${name}`,
        `Description: This staking contract offers ${maxNumServices} slots for operators running Olas Predict agents interacting with mechs registered on the new marketplace. It requires ${stakeOlas} OLAS for staking and ${dailyKPI.toString()} daily mech calls to meet KPI.`,
        `slots: ${maxNumServices}`,
        `RewardPerSecond: ${rewardPerSecond}`,
        `Stake: ${stakeOlas}`,
        `Minimum service staking deposit, OLAS: ${minStakingDepositOlas}`,
        `Minimum number of staking periods: ${minNumStakingPeriods}`,
        `Maximum number of inactivity periods: ${maxNumInactivityPeriods}`,
        `Liveness period, seconds: ${livenessPeriodSeconds}`,
        `Time for emissions, seconds: ${timeForEmissionsSeconds}`,
        `Number of agent instances: ${numAgentInstances}`,
        `Agent IDs: ${agentIds}`,
        `Multisig threshold: ${threshold}`,
        `Service configuration hash: ${configHash}`,
        `Proxy hash: ${proxyHash}`,
        `Activity checker address: ${activityChecker}`,
        `Daily KPI: ${dailyKPI.toString()}`
    ];

    return output.join("\n");
}

function main() {
    const inputPaths = getInputPathsFromCli(process.argv.slice(2));
    const outputs = inputPaths.map((inputPath) => buildOutput(inputPath));
    console.log(outputs.join("\n\n"));
}

main();
