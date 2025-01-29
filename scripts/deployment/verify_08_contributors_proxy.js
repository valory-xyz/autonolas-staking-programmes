const fs = require("fs");
const globalsFile = "globals.json";
const dataFromJSON = fs.readFileSync(globalsFile, "utf8");
const parsedData = JSON.parse(dataFromJSON);
const contributorsAddress = parsedData.contributorsAddress;
const gnosisSafeMultisigImplementationAddress = parsedData.gnosisSafeMultisigImplementationAddress;
const gnosisSafeSameAddressMultisigImplementationAddress = parsedData.gnosisSafeSameAddressMultisigImplementationAddress;
const fallbackHandlerAddress = parsedData.fallbackHandlerAddress;
const iface = new ethers.utils.Interface(["function initialize(address,address,address)"]);
const proxyData = iface.encodeFunctionData("initialize", [gnosisSafeMultisigImplementationAddress,
    gnosisSafeSameAddressMultisigImplementationAddress, fallbackHandlerAddress]);

module.exports = [
    contributorsAddress,
    proxyData
];