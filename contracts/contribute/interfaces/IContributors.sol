// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Contributors interface
interface IContributors {
    /// @dev Sets service info for the social id.
    /// @param socialId Social id.
    /// @param serviceId Service Id.
    /// @param multisig Service multisig address.
    /// @param stakingInstance Staking instance address.
    /// @param serviceOwner Service owner.
    function setServiceInfoForId(
        uint256 socialId,
        uint256 serviceId,
        address multisig,
        address stakingInstance,
        address serviceOwner
    ) external;

    /// @dev Gets service info corresponding to a specified social Id.
    /// @param socialId Social Id.
    /// @return serviceId Corresponding service Id.
    /// @return multisig Corresponding service multisig.
    /// @return stakingInstance Staking instance address.
    /// @return serviceOwner Service owner.
    function mapSocialIdServiceInfo(uint256 socialId) external view
    returns (uint256 serviceId, address multisig, address stakingInstance, address serviceOwner);
}
