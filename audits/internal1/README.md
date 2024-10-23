# Internal audit of autonolas-staking-programmes
The review has been performed based on the contract code in the following repository:<br>
`https://github.com/valory-xyz/autonolas-staking-programmes` <br>
commit: `v1.4.0-pre-internal-audit` or `585003faeec5dff2fd96a326f07c3e809dc32898` <br> 

## Objectives
The audit focused on contracts in this repo. <br>


### Flatten version
Flatten version of contracts. [contracts](https://github.com/valory-xyz/autonolas-staking-programmes/blob/main/audits/internal1/analysis/contracts) 

### ERC20/ERC721 checks
N/A

### Security issues. Updated 23-10-2024
#### Problems found instrumentally
Several checks are obtained automatically. They are commented. <br>
All automatic warnings are listed in the following file, concerns of which we address in more detail below: <br>
[slither-full](https://github.com/valory-xyz/autonolas-staking-programmes/blob/main/audits/internal1/analysis/slither_full.txt)

### Issue
1. Fixing reentrancy unstake()
```
more CEI,
        IToken(serviceRegistry).transfer(msg.sender, serviceId); = reentrancy via msg.sender as contract.
        // Zero the service info: the service is out of the contribute records, however multisig activity is still valid
        // If the same service is staked back, the multisig activity continues being tracked
        IContributors(contributorsProxy).setServiceInfoForId(msg.sender, 0, 0, address(0), address(0));
    
```
2. cyclic initialize(address _manager)
```
Remove params in proxy init() / or setup manage as msg.sender.
```


