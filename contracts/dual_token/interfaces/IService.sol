// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Service registry related interface
interface IService {
    /// @dev Gets the service instance from the map of services.
    /// @param serviceId Service Id.
    /// @return securityDeposit Registration activation deposit.
    /// @return multisig Service multisig address.
    /// @return configHash IPFS hashes pointing to the config metadata.
    /// @return threshold Agent instance signers threshold.
    /// @return maxNumAgentInstances Total number of agent instances.
    /// @return numAgentInstances Actual number of agent instances.
    /// @return state Service state.
    function mapServices(uint256 serviceId) external view returns (uint96 securityDeposit, address multisig,
        bytes32 configHash, uint32 threshold, uint32 maxNumAgentInstances, uint32 numAgentInstances, uint8   state);

    /// @dev Gets the owner of the token Id.
    /// @param tokenId Token Id.
    /// @return Token Id owner address.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @dev Sets token `id` as the allowance of `spender` over the caller's tokens.
    /// @param spender Account address that will be able to transfer the token on behalf of the caller.
    /// @param id Token id.
    function approve(address spender, uint256 id) external;

    /// @dev Transfers a specified token Id.
    /// @param from Account address to transfer from.
    /// @param to Account address to transfer to.
    /// @param id Token id.
    function transferFrom(address from, address to, uint256 id) external;

    /// @dev Transfers a specified token Id with a callback.
    /// @param from Account address to transfer from.
    /// @param to Account address to transfer to.
    /// @param id Token id.
    function safeTransferFrom(address from, address to, uint256 id) external;
}
