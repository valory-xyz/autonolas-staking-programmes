const fs = require("fs");
const globalsFile = "globals.json";
const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
const parsedData = JSON.parse(dataFromJSON);
const serviceRegistryAddress = parsedData.serviceRegistryAddress;
const secondTokenAddress = parsedData.secondTokenAddress;
const stakingTokenInstanceAddress = parsedData.stakingTokenInstanceAddress;
const stakeRatio = parsedData.stakeRatio;
const rewardRatio = parsedData.rewardRatio;

module.exports = [
    serviceRegistryAddress,
    secondTokenAddress,
    stakingTokenInstanceAddress,
    stakeRatio,
    rewardRatio
];