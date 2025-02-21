# Internal audit of autonolas-staking-programmes
The review has been performed based on the contract code in the following repository:<br>
`https://github.com/valory-xyz/autonolas-staking-programmes` <br>
commit: `v1.6.0-pre-internal-audit` or `710ee320d06acd0ee793fa13677987fb347dffdc` <br> 

## Objectives
The audit focused on contracts in this repo. <br>

### ERC20/ERC721 checks
N/A

### Security issues. 

#### Notes: DualStakingToken named revert
```
if (stakerInfo.account != address(0)) {
            revert();
        }
if (stakerInfo.account == address(0)) {
            revert();
        }
if (stakingState != IStaking.StakingState.Evicted) {
            revert();
        }
        // Check for staker existence
if (stakerInfo.account == address(0)) {
            revert();
        }
```
[]

#### Notes: One way deposit(). Should there be an opposite function or would overcomplicate the logic?
```
function deposit(uint256 amount) external {} <- can't redo deposit() 
```
[]

#### Notes: reward in both token? triple check and test logic
```
Why does the code only show rewards in second tokens? Shouldn't it be paid out symmetrically in OLAS/second ERC20 token?
```
[]

#### Notes: reward in second token. triple check and test logic
```
Why do we send a reward equal stakerInfo.reward to the second tokens? Why not stakerInfo.reward * ratio?
        uint256 reward = stakerInfo.reward;
        ...

        // Transfer second token reward to the service multisig
        if (reward > 0) {
            _withdraw(multisig, reward); <--- mul ratio?
        }
```
[]

#### Notes: Available reward in second token. triple check and tests logic
```
The logic looks confusing and somewhere it multiplies by ratio, sometime not. Please, triple check and test code!
        if (numServices > 0) {
            uint256 lastAvailableRewards = availableRewards;
            uint256 totalRewards;
            for (uint256 i = 0; i < numServices; ++i) {
                totalRewards += eligibleServiceRewards[i]; --> totalRewards += eligibleServiceRewards[i] --> without ratio
            }

            uint256 curServiceId;
            // If total allocated rewards are not enough, adjust the reward value
            if ((totalRewards * rewardRatio) / 1e18 > lastAvailableRewards) { --> totalRewards * rewardRatio vs lastAvailableRewards
                // Traverse all the eligible services and adjust their rewards proportional to leftovers
                // Note the algorithm is the exact copy of StakingBase logic
                uint256 updatedReward;
                uint256 updatedTotalRewards;
                for (uint256 i = 1; i < numServices; ++i) {
                    // Calculate the updated reward
                    updatedReward = (eligibleServiceRewards[i] * lastAvailableRewards) / totalRewards;
                    // Add to the total updated reward
                    updatedTotalRewards += updatedReward;

                    curServiceId = eligibleServiceIds[i];
                    // Add reward to the overall service reward
                    mapStakerInfos[curServiceId].reward += (updatedReward * rewardRatio) / 1e18;
                }

                // Process the first service in the set
                updatedReward = (eligibleServiceRewards[0] * lastAvailableRewards) / totalRewards;
                updatedTotalRewards += updatedReward;
                curServiceId = eligibleServiceIds[0];
                // If the reward adjustment happened to have small leftovers, add it to the first service
                if (lastAvailableRewards > updatedTotalRewards) {
                    updatedReward += lastAvailableRewards - updatedTotalRewards;
                }
                // Add reward to the overall service reward
                mapStakerInfos[curServiceId].reward += (updatedReward * rewardRatio) / 1e18;
                // Set available rewards to zero
                lastAvailableRewards = 0;
            } else {
                // Traverse all the eligible services and add to their rewards
                for (uint256 i = 0; i < numServices; ++i) {
                    // Add reward to the service overall reward
                    curServiceId = eligibleServiceIds[i];
                    mapStakerInfos[curServiceId].reward += (eligibleServiceRewards[i] * rewardRatio) / 1e18;
                }

                // Adjust available rewards
                lastAvailableRewards -= totalRewards; --> lastAvailableRewards vs totalRewards without ratio
            }

            // Update the storage value of available rewards
            availableRewards = lastAvailableRewards; --> lastAvailableRewards vs totalRewards without ratio
        }
```
[]




