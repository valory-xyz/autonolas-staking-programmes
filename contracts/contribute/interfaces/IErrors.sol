// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IErrors {
    /// @dev Zero address.
    error ZeroAddress();

    /// @dev Zero value.
    error ZeroValue();

    /// @dev Only `owner` has a privilege, but the `sender` was provided.
    /// @param sender Sender address.
    /// @param owner Required sender address as an owner.
    error OwnerOnly(address sender, address owner);

    /// @dev The contract is already initialized.
    error AlreadyInitialized();

    /// @dev Wrong length of two arrays.
    /// @param numValues1 Number of values in a first array.
    /// @param numValues2 Number of values in a second array.
    error WrongArrayLength(uint256 numValues1, uint256 numValues2);

    /// @dev Account is unauthorized.
    /// @param account Account address.
    error UnauthorizedAccount(address account);

    /// @dev Caught reentrancy violation.
    error ReentrancyGuard();

    /// @dev Service is already created and staked for the contributor.
    /// @param socialId Social Id.
    /// @param serviceId Service Id.
    /// @param multisig Multisig address.
    error ServiceAlreadyStaked(uint256 socialId, uint256 serviceId, address multisig);

    /// @dev Wrong staking instance.
    /// @param stakingInstance Staking instance address.
    error WrongStakingInstance(address stakingInstance);

    /// @dev Wrong provided service setup.
    /// @param socialId Social Id.
    /// @param serviceId Service Id.
    /// @param multisig Multisig address.
    error WrongServiceSetup(uint256 socialId, uint256 serviceId, address multisig);

    /// @dev Wrong service state.
    /// @param socialId Social Id.
    /// @param serviceId Service Id.
    /// @param state Service state.
    error WrongServiceState(uint256 socialId, uint256 serviceId, uint8 state);

    /// @dev Service is not defined for the social Id.
    /// @param socialId Social Id.
    error ServiceNotDefined(uint256 socialId);
}