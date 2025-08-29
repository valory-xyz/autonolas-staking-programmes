// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Staking interface
interface IStaking {
    enum StakingState {
        Unstaked,
        Staked,
        Evicted
    }

    /// @dev Gets activity checker address.
    /// @return Activity checker address.
    function activityChecker() external view returns (address);

    /// @dev Gets minimum service staking deposit value required for staking.
    /// @return Minimum service staking deposit.
    function minStakingDeposit() external view returns (uint256);

    /// @dev Gets number of agent instances in the service.
    /// @return Number of agent instances.
    function numAgentInstances() external view returns (uint256);

    /// @dev Stakes the service.
    /// @param serviceId Service Id.
    function stake(uint256 serviceId) external;

    /// @dev Unstakes the service with collected reward, if available.
    /// @param serviceId Service Id.
    /// @return reward Staking reward.
    function unstake(uint256 serviceId) external returns (uint256);

    /// @dev Claims rewards for the service without an additional checkpoint call.
    /// @param serviceId Service Id.
    /// @return Staking reward.
    function claim(uint256 serviceId) external returns (uint256);

    /// @dev Checkpoint to allocate rewards up until a current time.
    /// @return serviceIds Staking service Ids (excluding evicted ones within a current epoch).
    /// @return eligibleServiceIds Set of reward-eligible service Ids.
    /// @return eligibleServiceRewards Corresponding set of reward-eligible service rewards.
    /// @return evictServiceIds Evicted service Ids.
    function checkpoint() external returns (uint256[] memory serviceIds, uint256[] memory eligibleServiceIds,
        uint256[] memory eligibleServiceRewards, uint256[] memory evictServiceIds);

    /// @dev Gets the service staking state.
    /// @param serviceId.
    /// @return stakingState Staking state of the service.
    function getStakingState(uint256 serviceId) external view returns (StakingState stakingState);
}
