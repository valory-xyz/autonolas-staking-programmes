const fs = require("fs");
const globalsFile = "globals.json";
const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
const parsedData = JSON.parse(dataFromJSON);
const serviceManagerProxyAddress = parsedData.serviceManagerProxyAddress;
const olasAddress = parsedData.olasAddress;
const stakingFactoryAddress = parsedData.stakingFactoryAddress;
const agentId = parsedData.agentId;
const configHash = parsedData.configHash;

module.exports = [
    serviceManagerProxyAddress,
    olasAddress,
    stakingFactoryAddress,
    agentId,
    configHash
];