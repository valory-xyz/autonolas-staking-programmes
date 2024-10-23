const fs = require("fs");
const globalsFile = "globals.json";
const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
const parsedData = JSON.parse(dataFromJSON);
const contributorsProxyAddress = parsedData.contributorsProxyAddress;
const serviceManagerTokenAddress = parsedData.serviceManagerTokenAddress;
const olasAddress = parsedData.olasAddress;
const stakingFactoryAddress = parsedData.stakingFactoryAddress;
const gnosisSafeMultisigImplementationAddress = parsedData.gnosisSafeMultisigImplementationAddress;
const fallbackHandlerAddress = parsedData.fallbackHandlerAddress;
const agentId = parsedData.agentId;
const configHash = parsedData.configHash;

module.exports = [
    contributorsProxyAddress,
    serviceManagerTokenAddress,
    olasAddress,
    stakingFactoryAddress,
    gnosisSafeMultisigImplementationAddress,
    fallbackHandlerAddress,
    agentId,
    configHash
];