const fs = require("fs");
const globalsFile = "globals.json";
const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
const parsedData = JSON.parse(dataFromJSON);
const olasAddress = parsedData.olasAddress;
const contributeManagerAddress = parsedData.contributeManagerAddress;
const serviceRegistryAddress = parsedData.serviceRegistryAddress;
const serviceRegistryTokenUtilityAddress = parsedData.serviceRegistryTokenUtilityAddress;
const bridgeMediatorAddress = parsedData.bridgeMediatorAddress;
const refundFactor = parsedData.refundFactor;

module.exports = [
    olasAddress,
    contributeManagerAddress,
    serviceRegistryAddress,
    serviceRegistryTokenUtilityAddress,
    bridgeMediatorAddress,
    refundFactor
];