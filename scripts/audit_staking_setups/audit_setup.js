/*global process,__dirname*/

const { ethers } = require("hardhat");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const DEFAULT_MNEMONIC =
    "velvet deliver grief train result fortune travel voice over subject subject staff nominee bone name";
const DEPLOYMENT_DIR = path.resolve(__dirname, "../deployment");
const ACTIVITY_CHECKER_ABI = ["function livenessRatio() view returns (uint256)"];

function printUsage() {
    console.log(`Usage:
  npx hardhat run scripts/audit_staking_setups/audit_setup.js
  node scripts/audit_staking_setups/audit_setup.js [options]

Options:
  --all                    Include all JSON configs under scripts/deployment (recursive).
  --config <path>          Audit only this config file (repeatable).
  --contains <text>        Keep only configs whose path contains this text (repeatable).
  --provider <name>        Keep only configs with providerName equal to this value (repeatable).
  --contract <address>     Keep only configs whose stakingTokenInstanceAddress matches this address.
  --list-only              Print the selected config files and exit.
  --help                   Show this help.

Default behavior (no options):
  Audit files matching previous behavior:
  - filename contains "mainnet"
  - JSON has the stakingTokenInstanceAddress field
`);
}

function parseArgs(argv) {
    const options = {
        all: false,
        listOnly: false,
        configs: [],
        contains: [],
        providers: [],
        contract: ""
    };

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];

        switch (arg) {
        case "--all":
            options.all = true;
            break;
        case "--list-only":
            options.listOnly = true;
            break;
        case "--config":
            i++;
            if (i >= argv.length) {
                throw new Error("Missing value for --config");
            }
            options.configs.push(argv[i]);
            break;
        case "--contains":
            i++;
            if (i >= argv.length) {
                throw new Error("Missing value for --contains");
            }
            options.contains.push(argv[i].toLowerCase());
            break;
        case "--provider":
            i++;
            if (i >= argv.length) {
                throw new Error("Missing value for --provider");
            }
            options.providers.push(argv[i].toLowerCase());
            break;
        case "--contract":
            i++;
            if (i >= argv.length) {
                throw new Error("Missing value for --contract");
            }
            options.contract = argv[i].toLowerCase();
            break;
        case "--help":
            options.help = true;
            break;
        default:
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function toPosixPath(filePath) {
    return filePath.split(path.sep).join("/");
}

function walkJsonFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkJsonFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            files.push(fullPath);
        }
    }

    return files;
}

function readJson(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
}

function isDeployedAddress(address) {
    return typeof address === "string" && address.trim() !== "";
}

function customExpect(actual, expected, log, stats) {
    try {
        expect(actual).to.equal(expected);
    } catch (error) {
        stats.mismatches += 1;
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

function checkEmissionsAmount(rewardsPerSecond, maxNumServices, timeForEmissions, dispenserLimit, stats, logPrefix) {
    const emissionsAmount = rewardsPerSecond.mul(maxNumServices).mul(timeForEmissions);
    if (emissionsAmount.gt(dispenserLimit)) {
        stats.warnings += 1;
        if (logPrefix) {
            console.log(logPrefix + ", emissionsAmount");
        }
        console.log("emissionsAmount: ", emissionsAmount.toString());
        console.log("dispenserLimit: ", dispenserLimit.toString());
    }
}

function buildConfigEntries(options) {
    const files = [];
    const dedupe = new Set();

    if (options.configs.length > 0) {
        for (const item of options.configs) {
            const resolved = path.resolve(process.cwd(), item);
            if (!fs.existsSync(resolved)) {
                throw new Error(`Config file does not exist: ${resolved}`);
            }
            if (!dedupe.has(resolved)) {
                dedupe.add(resolved);
                files.push(resolved);
            }
        }
    } else {
        for (const filePath of walkJsonFiles(DEPLOYMENT_DIR)) {
            if (!dedupe.has(filePath)) {
                dedupe.add(filePath);
                files.push(filePath);
            }
        }
    }

    return files.map((filePath) => {
        try {
            const params = readJson(filePath);
            return { filePath, params, parseError: null };
        } catch (error) {
            return { filePath, params: null, parseError: error };
        }
    });
}

function applyDefaultSelection(entries, options) {
    if (options.configs.length > 0 || options.all) {
        return entries;
    }

    return entries.filter((entry) => {
        if (entry.parseError || !entry.params) {
            return false;
        }

        const fileName = path.basename(entry.filePath).toLowerCase();
        const hasInstanceField = Object.prototype.hasOwnProperty.call(entry.params, "stakingTokenInstanceAddress");
        return fileName.includes("mainnet") && hasInstanceField;
    });
}

function applyFilters(entries, options) {
    return entries.filter((entry) => {
        if (entry.parseError || !entry.params) {
            return false;
        }

        const filePathLower = toPosixPath(entry.filePath).toLowerCase();
        const providerName = (entry.params.providerName || "").toLowerCase();
        const contract = (entry.params.stakingTokenInstanceAddress || "").toLowerCase();

        if (options.contains.length > 0 && !options.contains.every((value) => filePathLower.includes(value))) {
            return false;
        }

        if (options.providers.length > 0 && !options.providers.includes(providerName)) {
            return false;
        }

        if (options.contract && contract !== options.contract) {
            return false;
        }

        return true;
    });
}

function getWallet(networkURL, mnemonic, walletCache) {
    if (walletCache.has(networkURL)) {
        return walletCache.get(networkURL);
    }

    const provider = new ethers.providers.JsonRpcProvider(networkURL);
    const account = ethers.utils.HDNode.fromMnemonic(mnemonic).derivePath("m/44'/60'/0'/0/0");
    const wallet = new ethers.Wallet(account, provider);
    walletCache.set(networkURL, wallet);
    return wallet;
}

async function auditEntry(entry, context) {
    const { dispenserLimit, walletCache, mnemonic, stats } = context;
    const { filePath, params } = entry;

    console.log("Verifying", toPosixPath(path.relative(process.cwd(), filePath)));

    const stakingParams = params.stakingParams;
    if (!stakingParams) {
        stats.skipped += 1;
        console.log("Skipping: missing stakingParams");
        return;
    }

    const stakingTokenAddress = params.stakingTokenInstanceAddress || "";
    const isDeployed = isDeployedAddress(stakingTokenAddress);
    const activityCheckerFromConfig = stakingParams.activityChecker || "";

    const checkActivityCheckerLivenessRatio = async (activityCheckerAddress, logPrefix) => {
        if (!isDeployedAddress(activityCheckerAddress)) {
            return;
        }

        if (!params.networkURL) {
            stats.skipped += 1;
            console.log("Skipping activity checker livenessRatio check: missing networkURL");
            return;
        }

        try {
            const wallet = getWallet(params.networkURL, mnemonic, walletCache);
            const activityChecker = new ethers.Contract(activityCheckerAddress, ACTIVITY_CHECKER_ABI, wallet);
            const livenessRatio = await activityChecker.livenessRatio();
            customExpect(livenessRatio, params.livenessRatio, logPrefix + ", livenessRatio", stats);
            stats.activityCheckerChecks += 1;
        } catch (error) {
            stats.errors += 1;
            console.error("Error while verifying activity checker for", filePath);
            console.error(error);
            console.log("\n");
        }
    };

    if (!isDeployed) {
        const rewardsPerSecond = ethers.BigNumber.from(stakingParams.rewardsPerSecond);
        const maxNumServices = ethers.BigNumber.from(stakingParams.maxNumServices);
        const timeForEmissions = ethers.BigNumber.from(stakingParams.timeForEmissions);
        checkEmissionsAmount(rewardsPerSecond, maxNumServices, timeForEmissions, dispenserLimit, stats, "");
        await checkActivityCheckerLivenessRatio(
            activityCheckerFromConfig,
            "ActivityChecker " + activityCheckerFromConfig + ", chain: " + params.providerName
        );
        stats.localChecks += 1;
        return;
    }

    if (!params.networkURL) {
        stats.skipped += 1;
        console.log("Skipping: missing networkURL for deployed stakingTokenInstanceAddress");
        return;
    }

    try {
        const wallet = getWallet(params.networkURL, mnemonic, walletCache);
        const stakingToken = await ethers.getContractAt("StakingToken", stakingTokenAddress, wallet);

        const log = "Contract " + stakingTokenAddress + ", chain: " + params.providerName;
        const metadataHash = await stakingToken.metadataHash();
        customExpect(metadataHash, stakingParams.metadataHash, log + ", metadataHash", stats);

        const minStakingDeposit = await stakingToken.minStakingDeposit();
        customExpect(minStakingDeposit, stakingParams.minStakingDeposit, log + ", minStakingDeposit", stats);

        const rewardsPerSecond = await stakingToken.rewardsPerSecond();
        customExpect(rewardsPerSecond, stakingParams.rewardsPerSecond, log + ", rewardsPerSecond", stats);
        const maxNumServices = await stakingToken.maxNumServices();
        customExpect(maxNumServices, stakingParams.maxNumServices, log + ", maxNumServices", stats);
        const timeForEmissions = await stakingToken.timeForEmissions();
        customExpect(timeForEmissions, stakingParams.timeForEmissions, log + ", timeForEmissions", stats);

        checkEmissionsAmount(rewardsPerSecond, maxNumServices, timeForEmissions, dispenserLimit, stats, log);

        const livenessPeriod = await stakingToken.livenessPeriod();
        customExpect(livenessPeriod, stakingParams.livenessPeriod, log + ", livenessPeriod", stats);

        const minNumStakingPeriods = ethers.BigNumber.from(stakingParams.minNumStakingPeriods);
        const minStakingDuration = await stakingToken.minStakingDuration();
        customExpect(minStakingDuration, minNumStakingPeriods.mul(livenessPeriod), log + ", minStakingDuration", stats);

        const maxNumInactivityPeriods = ethers.BigNumber.from(stakingParams.maxNumInactivityPeriods);
        const maxInactivityDuration = await stakingToken.maxInactivityDuration();
        customExpect(maxInactivityDuration, maxNumInactivityPeriods.mul(livenessPeriod), log + ", maxInactivityDuration", stats);

        const numAgentInstances = await stakingToken.numAgentInstances();
        customExpect(numAgentInstances, stakingParams.numAgentInstances, log + ", numAgentInstances", stats);
        if (stakingParams.agentIds.length > 0) {
            const agentId = await stakingToken.agentIds(0);
            customExpect(agentId, stakingParams.agentIds[0], log + ", agentIds", stats);
        }
        const threshold = await stakingToken.threshold();
        customExpect(threshold, stakingParams.threshold, log + ", threshold", stats);
        const configHash = await stakingToken.configHash();
        customExpect(configHash, stakingParams.configHash, log + ", configHash", stats);
        const proxyHash = await stakingToken.proxyHash();
        customExpect(proxyHash, stakingParams.proxyHash, log + ", proxyHash", stats);
        const serviceRegistry = await stakingToken.serviceRegistry();
        customExpect(serviceRegistry, stakingParams.serviceRegistry, log + ", serviceRegistry", stats);

        const activityCheckerAddress = await stakingToken.activityChecker();
        customExpect(activityCheckerAddress, stakingParams.activityChecker, log + ", activityChecker", stats);

        await checkActivityCheckerLivenessRatio(activityCheckerAddress, log);

        stats.onChainChecks += 1;
    } catch (error) {
        stats.errors += 1;
        console.error("Error while verifying", filePath);
        console.error(error);
        console.log("\n");
    }
}

async function main() {
    const options = parseArgs(process.argv);
    if (options.help) {
        printUsage();
        return 0;
    }

    // TODO - take from tokenomics contract on L1
    const dispenserLimit = ethers.utils.parseEther("60000");
    const mnemonic = process.env.TESTNET_MNEMONIC || DEFAULT_MNEMONIC;

    const stats = {
        mismatches: 0,
        warnings: 0,
        errors: 0,
        skipped: 0,
        onChainChecks: 0,
        localChecks: 0,
        activityCheckerChecks: 0
    };

    const discoveredEntries = buildConfigEntries(options);
    const parseErrors = discoveredEntries.filter((entry) => entry.parseError);
    if (parseErrors.length > 0) {
        for (const entry of parseErrors) {
            stats.errors += 1;
            console.error("Failed to parse JSON:", entry.filePath);
            console.error(entry.parseError.message);
        }
    }

    const selectedDefault = applyDefaultSelection(discoveredEntries, options);
    const selected = applyFilters(selectedDefault, options);

    if (selected.length === 0) {
        console.log("No configs matched the selected filters.");
        return stats.errors > 0 ? 1 : 0;
    }

    if (options.listOnly) {
        for (const entry of selected) {
            console.log(toPosixPath(path.relative(process.cwd(), entry.filePath)));
        }
        return stats.errors > 0 ? 1 : 0;
    }

    const walletCache = new Map();
    for (const entry of selected) {
        // Process sequentially to keep logs grouped by config and avoid RPC bursts.
        await auditEntry(entry, { dispenserLimit, walletCache, mnemonic, stats });
    }

    console.log("\nSummary");
    console.log("Selected configs:", selected.length);
    console.log("On-chain staking instrances checks:", stats.onChainChecks);
    console.log("Local checks:", stats.localChecks);
    console.log("Activity checker checks:", stats.activityCheckerChecks);
    console.log("Mismatches:", stats.mismatches);
    console.log("Warnings:", stats.warnings);
    console.log("Errors:", stats.errors);
    console.log("Skipped:", stats.skipped);

    return stats.mismatches > 0 || stats.errors > 0 ? 1 : 0;
}

main()
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
