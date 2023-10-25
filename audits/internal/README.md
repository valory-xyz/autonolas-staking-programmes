# Internal audit of autonolas-staking-programmes
The review has been performed based on the contract code in the following repository:<br>
`https://github.com/valory-xyz/autonolas-staking-programmes` <br>
commit: `v1.1.7.pre-internal-audit` <br> 

## Objectives
The audit focused on contracts in this repo. <br>
Before being allocated to this repository, the code was audited in [audit-before](https://github.com/valory-xyz/autonolas-registries/blob/main/audits/internal4/README.md) <br>

### Flatten version
Flatten version of contracts. [contracts](https://github.com/valory-xyz/autonolas-staking-programmes/blob/main/audits/internal/analysis/contracts) 

### ERC20/ERC721 checks
N/A

### Security issues. Updated 25-10-2023
#### Problems found instrumentally
Several checks are obtained automatically. They are commented. <br>
All automatic warnings are listed in the following file, concerns of which we address in more detail below: <br>
[slither-full](https://github.com/valory-xyz/autonolas-staking-programmes/blob/main/audits/internal/analysis/slither_full.txt)
Re-audit after extract Mech contracts into a this repo. <br>
I don't see any new problems after separating to this repository. <br>
