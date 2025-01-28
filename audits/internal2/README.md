# Internal audit of autonolas-staking-programmes
The review has been performed based on the contract code in the following repository:<br>
`https://github.com/valory-xyz/autonolas-staking-programmes` <br>
commit: `v1.5.0-pre-internal-audit` or `ec0f0125f80f6b170084eb57fcc98741f17fdc47` <br> 

## Objectives
The audit focused on contracts in this repo. <br>

### ERC20/ERC721 checks
N/A

### Security issues. Updated 28-01-2025
#### Critical. refundFactor not setupped RecovererContributeManager
```
    // Refund factor in 1e18 format
    uint256 public immutable refundFactor;
    NOT setupped and always equal zero. 
    Please, re-check tests!!
    Why we needed uint256 refund = securityDeposit * refundFactor / 1e18; ?
```
[]

#### Medium/Notes: old proxy vs new implementation.
```
It should be noted in doc that the new code of Contributors.sol will not be used as implementation with old proxy.
Because, they are not compatible at the storage planning/using level.
So, depricated contract only for history.
Never use new implementation with old proxy!
```
[]

#### Medium: Missed re-entrancy guard Contributors
```
function pullUnbondedService() external {}
+
        // Clear contributor records completely
        delete mapAccountServiceInfo[msg.sender]; - first
```
[]

#### Notes: Optimization Contributors
```
        serviceRegistry = IService(serviceManager).serviceRegistry();
        serviceRegistryTokenUtility = IService(serviceManager).serviceRegistryTokenUtility();
        serviceManager => _serviceManager # No need to read from storage again.
```
[]

#### Notes: Low/Optimization underscore variable _nonce in storage
```
    // Nonce
    uint256 internal _nonce;
    to
    uint256 internal nonce;
    We are used to the fact that the underscore in front is a variable in memory
    Exclude _locked.
```
[]

#### Notes: checks-effects-interactions (CEI) pattern as possible
```
function _unstake(
            INFToken(serviceRegistry).transferFrom(address(this), msg.sender, serviceId);

            // Zero the service info: the service is out of the contribute records, however multisig activity is still valid
            // If the same service is staked back, the multisig activity continues being tracked
            delete mapAccountServiceInfo[msg.sender];
        to
           delete mapAccountServiceInfo[msg.sender];
           INFToken(serviceRegistry).transferFrom(address(this), msg.sender, serviceId); 
```
[]

#### Notes: remove or fix TODO
```
grep -r TODO ./contracts/
./contracts/contribute/Contributors.sol:    // TODO provide as input params where needed instead of setting state vars
./contracts/contribute/Contributors.sol:    // TODO provide as input params where needed instead of setting state vars
```
[]




