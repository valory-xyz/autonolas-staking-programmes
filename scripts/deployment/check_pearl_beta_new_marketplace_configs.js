#!/usr/bin/env node
/*global process,__dirname*/

const fs = require("fs");
const path = require("path");

const WEI = 10n ** 18n;
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const PROXY_HASH = "0xb89c1b3bdf2cf8827818646bce9a8f6e372885f8c55e5c07acbd307cb133b000";

const expectedConfigs = [
    {
        fileName: "globals_gnosis_mainnet_pearl_beta_new_marketplace5.json",
        name: "Pearl Beta Mech Marketplace V",
        description: "This staking contract offers 50 slots for operators running Olas Predict agents interacting with mechs registered on the new marketplace. It requires 10000 OLAS for staking and 16 daily mech calls to meet kpi.",
        stakeOlas: "10000",
        minStakingDepositOlas: "5000",
        rewardPerSecondOlas: "0.000317097919837646",
        dailyKpi: 16n,
        activityChecker: "0x72C7A5E1b684966C3326c86A7D27c7C570Cc4DAC"
    },
    {
        fileName: "globals_gnosis_mainnet_pearl_beta_new_marketplace6.json",
        name: "Pearl Beta Mech Marketplace VI",
        description: "This staking contract offers 50 slots for operators running Olas Predict agents interacting with mechs registered on the new marketplace. It requires 10000 OLAS for staking and 16 daily mech calls to meet kpi.",
        stakeOlas: "10000",
        minStakingDepositOlas: "5000",
        rewardPerSecondOlas: "0.000317097919837646",
        dailyKpi: 16n,
        activityChecker: "0x72C7A5E1b684966C3326c86A7D27c7C570Cc4DAC"
    },
    {
        fileName: "globals_gnosis_mainnet_pearl_beta_new_marketplace7.json",
        name: "Pearl Beta Mech Marketplace VII",
        description: "This staking contract offers 50 slots for operators running Olas Predict agents interacting with mechs registered on the new marketplace. It requires 10000 OLAS for staking and 16 daily mech calls to meet kpi.",
        stakeOlas: "10000",
        minStakingDepositOlas: "5000",
        rewardPerSecondOlas: "0.000317097919837646",
        dailyKpi: 16n,
        activityChecker: "0x72C7A5E1b684966C3326c86A7D27c7C570Cc4DAC"
    },
    {
        fileName: "globals_gnosis_mainnet_pearl_beta_new_marketplace8.json",
        name: "Pearl Beta Mech Marketplace VIII",
        description: "This staking contract offers 50 slots for operators running Olas Predict agents interacting with mechs registered on the new marketplace. It requires 5000 OLAS for staking and 7 daily mech calls to meet kpi.",
        stakeOlas: "5000",
        minStakingDepositOlas: "2500",
        rewardPerSecondOlas: "0.000158548959918823",
        dailyKpi: 7n,
        activityChecker: "0x95b37c45BADAf4668c18d00501948196761736b1"
    }
];

function parseOlasToWei(value) {
    const [whole, fraction = ""] = value.split(".");
    const paddedFraction = fraction.padEnd(18, "0");
    if (paddedFraction.length > 18) {
        throw new Error(`Too many decimal places in OLAS value: ${value}`);
    }
    return BigInt(whole) * WEI + BigInt(paddedFraction || "0");
}

function formatWeiToOlas(value) {
    const whole = value / WEI;
    const fraction = value % WEI;
    if (fraction === 0n) {
        return whole.toString();
    }
    return `${whole.toString()}.${fraction.toString().padStart(18, "0").replace(/0+$/, "")}`;
}

function assertEqual(actual, expected, label, errors) {
    if (actual !== expected) {
        errors.push(`${label}: expected ${expected}, got ${actual}`);
    }
}

function dailyKpiFromConfig(livenessRatio, livenessPeriod) {
    return (livenessRatio * livenessPeriod + (WEI - 1n)) / WEI;
}

function checkConfig(expected) {
    const filePath = path.join(__dirname, expected.fileName);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const stakingParams = data.stakingParams || {};
    const errors = [];
    const livenessPeriod = BigInt(stakingParams.livenessPeriod || "0");
    const livenessRatio = BigInt(data.livenessRatio || "0");
    const minStakingDeposit = BigInt(stakingParams.minStakingDeposit || "0");
    const rewardsPerSecond = BigInt(stakingParams.rewardsPerSecond || "0");
    const stake = minStakingDeposit * 2n;
    const dailyKpi = dailyKpiFromConfig(livenessRatio, livenessPeriod);

    assertEqual(data.providerName, "gnosis", `${expected.fileName} providerName`, errors);
    assertEqual(data.name, expected.name, `${expected.fileName} name`, errors);
    assertEqual(data.description, expected.description, `${expected.fileName} description`, errors);
    assertEqual(stakingParams.maxNumServices, "50", `${expected.fileName} maxNumServices`, errors);
    assertEqual(rewardsPerSecond.toString(), parseOlasToWei(expected.rewardPerSecondOlas).toString(), `${expected.fileName} rewardsPerSecond`, errors);
    assertEqual(minStakingDeposit.toString(), parseOlasToWei(expected.minStakingDepositOlas).toString(), `${expected.fileName} minStakingDeposit`, errors);
    assertEqual(formatWeiToOlas(stake), expected.stakeOlas, `${expected.fileName} stake`, errors);
    assertEqual(stakingParams.minNumStakingPeriods, "3", `${expected.fileName} minNumStakingPeriods`, errors);
    assertEqual(stakingParams.maxNumInactivityPeriods, "2", `${expected.fileName} maxNumInactivityPeriods`, errors);
    assertEqual(stakingParams.livenessPeriod, "86400", `${expected.fileName} livenessPeriod`, errors);
    assertEqual(stakingParams.timeForEmissions, "2592000", `${expected.fileName} timeForEmissions`, errors);
    assertEqual(stakingParams.numAgentInstances, "1", `${expected.fileName} numAgentInstances`, errors);
    assertEqual(JSON.stringify(stakingParams.agentIds), JSON.stringify(["25"]), `${expected.fileName} agentIds`, errors);
    assertEqual(stakingParams.threshold, "0", `${expected.fileName} threshold`, errors);
    assertEqual(stakingParams.configHash, ZERO_HASH, `${expected.fileName} configHash`, errors);
    assertEqual(stakingParams.proxyHash, PROXY_HASH, `${expected.fileName} proxyHash`, errors);
    assertEqual(data.requesterActivityCheckerAddress, expected.activityChecker, `${expected.fileName} requesterActivityCheckerAddress`, errors);
    assertEqual(stakingParams.activityChecker, expected.activityChecker, `${expected.fileName} activityChecker`, errors);
    assertEqual(dailyKpi.toString(), expected.dailyKpi.toString(), `${expected.fileName} daily KPI`, errors);

    const emissions = rewardsPerSecond * BigInt(stakingParams.maxNumServices) * BigInt(stakingParams.timeForEmissions);

    return {
        name: expected.name,
        fileName: expected.fileName,
        errors,
        summary: {
            slots: stakingParams.maxNumServices,
            rewardPerSecond: formatWeiToOlas(rewardsPerSecond),
            stake: formatWeiToOlas(stake),
            minStakingDeposit: formatWeiToOlas(minStakingDeposit),
            dailyKpi: dailyKpi.toString(),
            emissions: formatWeiToOlas(emissions),
            activityChecker: stakingParams.activityChecker
        }
    };
}

function main() {
    const results = expectedConfigs.map(checkConfig);
    const errors = results.flatMap((result) => result.errors);

    for (const result of results) {
        const summary = result.summary;
        console.log(`${result.name} (${result.fileName})`);
        console.log(`  slots=${summary.slots}, rewardPerSecond=${summary.rewardPerSecond}, stake=${summary.stake}, minDeposit=${summary.minStakingDeposit}, dailyKPI=${summary.dailyKpi}`);
        console.log(`  emissions=${summary.emissions}, activityChecker=${summary.activityChecker}`);
    }

    if (errors.length > 0) {
        console.error("\nMismatches");
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }

    console.log("\nAll Pearl Beta Mech Marketplace V-VIII config checks passed.");
}

main();
