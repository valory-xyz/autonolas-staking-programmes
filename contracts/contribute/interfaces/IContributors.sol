// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Contributors interface
interface IContributors {
    /// @dev Sets service info for the social id.
    /// @param serviceOwner Service owner.
    /// @param socialId Social id.
    /// @param serviceId Service Id.
    /// @param multisig Service multisig address.
    /// @param stakingInstance Staking instance address.
    function setServiceInfoForId(
        address serviceOwner,
        uint256 socialId,
        uint256 serviceId,
        address multisig,
        address stakingInstance
    ) external;

    /// @dev Gets service info corresponding to a specified social Id.
    /// @param serviceOwner Service owner.
    /// @return socialId Social Id.
    /// @return serviceId Corresponding service Id.
    /// @return multisig Corresponding service multisig.
    /// @return stakingInstance Staking instance address.
    function mapSocialIdServiceInfo(address serviceOwner) external view
    returns (uint256 socialId, uint256 serviceId, address multisig, address stakingInstance);
}
