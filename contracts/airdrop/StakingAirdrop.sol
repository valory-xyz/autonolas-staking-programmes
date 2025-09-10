// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev Service Registry interface
interface IServiceRegistry {
    /// @dev Gets the owner of a specified service Id.
    /// @param serviceId Service Id.
    /// @return serviceOwner Service owner address.
    function ownerOf(uint256 serviceId) external view returns (address serviceOwner);
}

/// @dev Generic IERC20 token interface
interface IToken {
    /// @dev Gets the amount of tokens owned by a specified account.
    /// @param account Account address.
    /// @return Amount of tokens owned.
    function balanceOf(address account) external view returns (uint256);

    /// @dev Transfers the token amount.
    /// @param to Address to transfer to.
    /// @param amount The amount to transfer.
    /// @return True if the function execution is successful.
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @dev Provided zero address.
error ZeroAddress();

/// @dev Provided zero value.
error ZeroValue();

/// @dev Only `owner` has a privilege, but the `sender` was provided.
/// @param sender Sender address.
/// @param owner Required sender address as an owner.
error OwnerOnly(address sender, address owner);

/// @dev Wrong length of two arrays.
/// @param numValues1 Number of values in a first array.
/// @param numValues2 Number of values in a second array.
error WrongArrayLength(uint256 numValues1, uint256 numValues2);

/// @dev Provided incorrect amount.
/// @param provided Provided amount.
/// @param expected Expected amount.
error WrongAmount(uint256 provided, uint256 expected);

/// @dev Value overflow.
/// @param provided Overflow value.
/// @param max Maximum possible value.
error Overflow(uint256 provided, uint256 max);

/// @dev Caught reentrancy violation.
error ReentrancyGuard();


/// @title StakingAirdrop - Smart contract for staking airdrop
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Mariapia Moscatiello - <mariapia.moscatiello@valory.xyz>
contract StakingAirdrop {
    event Claimed(address indexed sender, uint256 indexed serviceId, uint256 amount);

    // Version number
    string public constant VERSION = "0.1.0";
    // Airdrop amount
    uint256 public constant AIRDROP_AMOUNT = 10_000;

    // Token address
    address public immutable token;
    // Service registry address
    address public immutable serviceRegistry;

    // Reentrancy lock
    uint256 internal _locked = 1;

    // Mapping of service Id => airdrop amount
    mapping(uint256 => uint256) public mapServiceIdAirdropAmount;

    /// @dev StakingAirdrop constructor.
    /// @param _token Token address.
    /// @param _serviceRegistry Service registry address.
    /// @param _serviceIds Set of service Ids.
    /// @param _amounts Set of corresponding amounts.
    constructor(
        address _token,
        address _serviceRegistry,
        uint256[] memory _serviceIds,
        uint256[] memory _amounts
    ) {
        // Check for zero addresses
        if (_token == address(0) || _serviceRegistry == address(0)) {
            revert ZeroAddress();
        }

        // Check array lengths
        if (_serviceIds.length != _amounts.length) {
            revert WrongArrayLength(_serviceIds.length, _amounts.length);
        }

        token = _token;
        serviceRegistry = _serviceRegistry;

        uint256 checkTotalAmount;
        // Assign airdrop amounts
        for (uint256 i = 0; i < _serviceIds.length; ++i) {
            checkTotalAmount += _amounts[i];
            mapServiceIdAirdropAmount[_serviceIds[i]] = _amounts[i];
        }

        if (checkTotalAmount != AIRDROP_AMOUNT) {
            revert WrongAmount(checkTotalAmount, AIRDROP_AMOUNT);
        }
    }

    /// @dev Claims airdrop.
    /// @param serviceId Service Id.
    function claim(uint256 serviceId) external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Get service owner
        address serviceOwner = IServiceRegistry(serviceRegistry).ownerOf(serviceId);

        // Check service owner
        if (msg.sender != serviceOwner) {
            revert OwnerOnly(msg.sender, serviceOwner);
        }
        
        // Get airdrop amount
        uint256 amount = mapServiceIdAirdropAmount[serviceId];
        
        // Check for zero value
        if (amount == 0) {
            revert ZeroValue();
        }

        // Get contract balance
        uint256 balance = IToken(token).balanceOf(address(this));
        // Check for amount overflow
        if (amount > balance) {
            revert Overflow(amount, balance);
        }

        // Zero airdrop amount
        mapServiceIdAirdropAmount[serviceId] = 0;

        // Transfer airdrop tokens
        IToken(token).transfer(msg.sender, amount);

        emit Claimed(msg.sender, serviceId, amount);

        _locked = 1;
    }
}