const fs = require("fs");
const globalsFile = "globals.json";
const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
const parsedData = JSON.parse(dataFromJSON);
const agentMechAddress = parsedData.agentMechAddress;
const livenessRatio = parsedData.livenessRatio;

module.exports = [
    agentMechAddress,
    livenessRatio
];