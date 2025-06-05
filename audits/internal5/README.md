# Internal audit of autonolas-staking-programmes
The review has been performed based on the contract code in the following repository:<br>
`https://github.com/valory-xyz/autonolas-staking-programmes` <br>
commit: `v1.6.3-pre-internal-audit` or `d749f38081b35435fe5b392ce6d6c634a3bd7518` <br> 

## Objectives
The audit focused on contracts in this repo. <br>

### ERC20/ERC721 checks
N/A

### Contract coverage
```
 registry_tracker/                       |      100 |       92 |    92.86 |    93.98 |                |
  RegistryTracker.sol                    |      100 |    92.86 |      100 |    95.45 |    244,263,269 |
  RegistryTrackerActivityChecker.sol     |      100 |      100 |      100 |      100 |                |
  RegistryTrackerProxy.sol               |      100 |    83.33 |    66.67 |       80 |          52,72 |
-----------------------------------------|----------|----------|----------|----------|----------------|
```
No issue

### Security issues. 
### Low issue, notes
```
        // Whitelist activity checker hashes
        for (uint256 i = 0; i < activityCheckerHashes.length; ++i) {
            // Check for zero values
            if (activityCheckerHashes[i] == 0) {
                revert ZeroValue();
            }

            mapActivityCheckerHashes[activityCheckerHashes[i]] = true;
        }
        maybe check agains keccak256("")?
        https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1052.md#specification
        ref: The EXTCODEHASH of the account without code is c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470 what is the keccak256 hash of empty data.
```
[]

### Notes. Using directly OPCODE 
```
Not a bug or a problem due to good optimization in modern compilers.
bytes32 activityCheckerHash = keccak256(activityChecker.code);
vs 
bytes32 activityCheckerHash;    
assembly { activityCheckerHash := extcodehash(activityChecker) }
or
bytes32 activityCheckerHash =  activityChecker.codehash

https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1052.md#specification
https://www.rareskills.io/post/solidity-code-length (notes ref: codehash)
https://docs.soliditylang.org/en/latest/units-and-global-variables.html

OPCODE covered all borderline issue: 
- no code
- non-existent account
- precompiled contract
- selfdestructed 
Notes: codehash can be 0 OR(!) keccak256("") for non-contract or selfdestruct account
https://github.com/ethereum/solidity/issues/14794
https://code4rena.com/reports/2023-10-wildcat#h-02-codehash-check-in-factory-contracts-does-not-account-for-non-empty-addresses
```
[]

### Notes. Calculate hash on fly in whitelistActivityCheckerHashes
```
Like the previous comment, this is not a bug, but it might be easier to manage since manually calculating the hash can be more error prone than a list of contract addresses.
whitelistActivityCheckerHashes
vs
whitelistActivityChecker based on array of address
if (activityChecker[i].code.length == 0) { revert();} // no-contract or selfdestruct
mapActivityCheckerHashes[keccak256(activityChecker[i].code)] = true;
```
[]


