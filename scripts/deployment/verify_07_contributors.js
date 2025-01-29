const fs = require("fs");
const globalsFile = "globals.json";
const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
const parsedData = JSON.parse(dataFromJSON);
const serviceManagerTokenAddress = parsedData.serviceManagerTokenAddress;
const olasAddress = parsedData.olasAddress;
const stakingFactoryAddress = parsedData.stakingFactoryAddress;
const agentId = parsedData.agentId;
const configHash = parsedData.configHash;

module.exports = [
    serviceManagerTokenAddress,
    olasAddress,
    stakingFactoryAddress,
    agentId,
    configHash
];