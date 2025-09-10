// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev Service Registry interface
interface IServiceRegistry {
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
        bytes32 configHash, uint32 threshold, uint32 maxNumAgentInstances, uint32 numAgentInstances, uint8 state);
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

/// @dev Provided non zero value.
error NonZeroValue();

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
contract StakingAirdrop {
    event Claimed(address indexed sender, uint256 indexed serviceId, address indexed multisig, uint256 amount);
    event ZeroMultisigAddress(uint256 serviceId);

    // Version number
    string public constant VERSION = "0.1.0";

    // Token address
    address public immutable token;
    // Service registry address
    address public immutable serviceRegistry;
    // Total airdrop amount
    uint256 public immutable airdropAmount;

    // Reentrancy lock
    uint256 internal _locked = 1;

    // Mapping of service Id => airdrop amount
    mapping(uint256 => uint256) public mapServiceIdAirdropAmount;
    // Service Ids eligible for for airdrop
    uint256[] public serviceIds;

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
        if (_serviceIds.length == 0 || _serviceIds.length != _amounts.length) {
            revert WrongArrayLength(_serviceIds.length, _amounts.length);
        }

        token = _token;
        serviceRegistry = _serviceRegistry;

        // Assign airdrop amounts
        for (uint256 i = 0; i < _serviceIds.length; ++i) {
            // Check for already assigned amount
            if (mapServiceIdAirdropAmount[_serviceIds[i]] > 0) {
                revert NonZeroValue();
            }

            // Check for zero amount
            if (_amounts[i] == 0) {
                revert ZeroValue();
            }

            // Add to total airdrop amount
            airdropAmount += _amounts[i];

            // Record amount and service Id
            mapServiceIdAirdropAmount[_serviceIds[i]] = _amounts[i];
            serviceIds.push(_serviceIds[i]);
        }
    }

    /// @dev Claims airdrop.
    /// @notice Any `msg.sender` is able to trigger claim for eligible service Id.
    /// @param serviceId Service Id.
    function claim(uint256 serviceId) external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        // Get service multisig
        (, address multisig, , , , , ) = IServiceRegistry(serviceRegistry).mapServices(serviceId);

        // Check multisig address
        if (multisig == address(0)) {
            revert ZeroAddress();
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
        IToken(token).transfer(multisig, amount);

        emit Claimed(msg.sender, serviceId, multisig, amount);

        _locked = 1;
    }

    /// @dev Claims airdrop for all eligible service Ids.
    /// @notice Any `msg.sender` is able to trigger claim for eligible service Ids.
    function claimAll() external {
        // Reentrancy guard
        if (_locked > 1) {
            revert ReentrancyGuard();
        }
        _locked = 2;

        uint256 numServiceIds = serviceIds.length;
        uint256[] memory localServiceIds = new uint256[](numServiceIds);
        uint256[] memory localAmounts = new uint256[](numServiceIds);
        uint256 totalAmount;

        // Traverse all service Ids for amounts computation
        for (uint256 i = 0; i < numServiceIds; ++i) {
            localServiceIds[i] = serviceIds[i];

            // Get airdrop amount for a specific service Id
            uint256 amount = mapServiceIdAirdropAmount[localServiceIds[i]];

            // Check for non-zero value, i.e. skip all manually claimed ones
            if (amount > 0) {
                localAmounts[i] = amount;
                // Add to total amount
                totalAmount += amount;

                // Zero airdrop amount
                mapServiceIdAirdropAmount[localServiceIds[i]] = 0;
            }
        }

        // Get contract balance
        uint256 balance = IToken(token).balanceOf(address(this));
        // Check for total amount overflow
        if (totalAmount > balance) {
            revert Overflow(totalAmount, balance);
        }

        // Traverse all service Ids for transfer
        for (uint256 i = 0; i < numServiceIds; ++i) {
            // Check for zero value
            if (localAmounts[i] == 0) {
                continue;
            }

            // Get service multisig
            (, address multisig, , , , , ) = IServiceRegistry(serviceRegistry).mapServices(localServiceIds[i]);

            // Check multisig address
            if (multisig == address(0)) {
                emit ZeroMultisigAddress(localServiceIds[i]);
                continue;
            }

            // Transfer airdrop tokens
            IToken(token).transfer(multisig, localAmounts[i]);

            emit Claimed(msg.sender, localServiceIds[i], multisig, localAmounts[i]);
        }

        _locked = 1;
    }
}