# Internal audit of autonolas-staking-programmes
The review has been performed based on the contract code in the following repository:<br>
`https://github.com/valory-xyz/autonolas-staking-programmes` <br>
commit: `v1.6.1-pre-internal-audit` or `b27558a18b44e2ec94bd19b330e87447b49a9f9a` <br> 

## Objectives
The audit focused on contracts in this repo. <br>

### ERC20/ERC721 checks
N/A

### Security issues. 

#### Notes/Low. Balance possible zero
```
uint256 balance = IToken(secondToken).balanceOf(address(this)) - secondTokenAmount * numServices; 
-> no deposit (!)
-> IToken(secondToken).balanceOf(address(this)) == secondTokenAmount * numServices -> only SafeTransferLib.safeTransferFrom(secondToken, msg.sender, address(this), secondTokenAmount); from stake
-> balance = 0


// Limit reward if there is not enough on a balance
if (reward > balance) {
    reward = balance; -> reward = 0
}
// reward value is always non-zero -> false

or claim after claim all:
1. claim reward > balance -> reward = balance; -> IToken(secondToken).balanceOf(address(this)) == secondTokenAmount * numServices
2. claim reward > balance -> reward = balance = 0
```
[]

#### Notes/Low. Missing (?) deposit()
```
There is no explicit deposit() token function
```
[]



