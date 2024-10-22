// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Only `owner` has a privilege, but the `sender` was provided.
/// @param sender Sender address.
/// @param owner Required sender address as an owner.
error OwnerOnly(address sender, address owner);

/// @dev The contract is already initialized.
error AlreadyInitialized();

/// @dev Zero address.
error ZeroAddress();

/// @dev Only manager is allowed to have access.
error OnlyManager(address sender, address manager);

/// @dev Wrong length of two arrays.
/// @param numValues1 Number of values in a first array.
/// @param numValues2 Number of values in a second array.
error WrongArrayLength(uint256 numValues1, uint256 numValues2);

/// @dev Account is unauthorized.
/// @param account Account address.
error UnauthorizedAccount(address account);

// Struct for service info
struct ServiceInfo {
    // Service Id
    uint256 serviceId;
    // Corresponding service multisig
    address multisig;
    // Staking instance address
    address stakingInstance;
    // Service owner address
    address serviceOwner;
}

/// @title Contributors - Smart contract for managing contributors
/// @author Aleksandr Kuperman - <aleksandr.kuperman@valory.xyz>
/// @author Andrey Lebedev - <andrey.lebedev@valory.xyz>
/// @author Tatiana Priemova - <tatiana.priemova@valory.xyz>
/// @author David Vilela - <david.vilelafreire@valory.xyz>
contract Contributors {
    event ImplementationUpdated(address indexed implementation);
    event OwnerUpdated(address indexed owner);
    event ManagerUpdated(address indexed manager);
    event SetServiceInfoForId(uint256 indexed socialId, uint256 indexed serviceId, address multisig,
        address stakingInstance, address indexed serviceOwner);
    event SetContributeAgentStatuses(address[] mechMarketplaces, bool[] statuses);
    event MultisigActivityChanged(address indexed senderAgent, address[] multisigs, uint256[] activityChanges);

    // Version number
    string public constant VERSION = "1.0.0";
    // Code position in storage is keccak256("CONTRIBUTORS_PROXY") = "0x8f33b4c48c4f3159dc130f2111086160da6c94439c147bd337ecee0aa81518c7"
    bytes32 public constant CONTRIBUTORS_PROXY = 0x8f33b4c48c4f3159dc130f2111086160da6c94439c147bd337ecee0aa81518c7;

    // Contract owner
    address public owner;
    // Service manager contract address
    address public manager;

    // Mapping of social id => service info
    mapping(uint256 => ServiceInfo) public mapSocialIdServiceInfo;
    // Mapping of service multisig address => activity
    mapping(address => uint256) public mapMutisigActivities;
    // Mapping of whitelisted contributor agents
    mapping(address => bool) public mapContributeAgents;

    /// @dev Contributors initializer.
    /// @param _manager Manager address.
    function initialize(address _manager) external{
        // Check for already initialized
        if (owner != address(0)) {
            revert AlreadyInitialized();
        }

        // Check for zero address
        if (_manager == address(0)) {
            revert ZeroAddress();
        }

        owner = msg.sender;
        manager = _manager;
    }

    /// @dev Changes the contributors implementation contract address.
    /// @param newImplementation New implementation contract address.
    function changeImplementation(address newImplementation) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for zero address
        if (newImplementation == address(0)) {
            revert ZeroAddress();
        }

        // Store the contributors implementation address
        assembly {
            sstore(CONTRIBUTORS_PROXY, newImplementation)
        }

        emit ImplementationUpdated(newImplementation);
    }

    /// @dev Changes contract owner address.
    /// @param newOwner Address of a new owner.
    function changeOwner(address newOwner) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for the zero address
        if (newOwner == address(0)) {
            revert ZeroAddress();
        }

        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    /// @dev Changes contract manager address.
    /// @param newManager Address of a new manager.
    function changeManager(address newManager) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for the zero address
        if (newManager == address(0)) {
            revert ZeroAddress();
        }

        manager = newManager;
        emit ManagerUpdated(newManager);
    }

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
    ) external {
        // Check for manager
        if (msg.sender != manager) {
            revert OnlyManager(msg.sender, manager);
        }

        // Set (or remove) multisig for the corresponding social id
        ServiceInfo storage serviceInfo = mapSocialIdServiceInfo[socialId];
        serviceInfo.serviceId = serviceId;
        serviceInfo.multisig = multisig;
        serviceInfo.stakingInstance = stakingInstance;
        serviceInfo.serviceOwner = serviceOwner;

        emit SetServiceInfoForId(socialId, serviceId, multisig, stakingInstance, serviceOwner);
    }

    /// @dev Sets contribute agent statues.
    /// @param contributeAgents Contribute agent addresses.
    /// @param statuses Corresponding whitelisting statues.
    function setMechMarketplaceStatuses(address[] memory contributeAgents, bool[] memory statuses) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for array lengths
        if (contributeAgents.length != statuses.length) {
            revert WrongArrayLength(contributeAgents.length, statuses.length);
        }

        // Traverse all the mech marketplaces and statuses
        for (uint256 i = 0; i < contributeAgents.length; ++i) {
            if (contributeAgents[i] == address(0)) {
                revert ZeroAddress();
            }

            mapContributeAgents[contributeAgents[i]] = statuses[i];
        }

        emit SetContributeAgentStatuses(contributeAgents, statuses);
    }

    /// @dev Increases multisig activity by the contribute agent.
    /// @param multisigs Multisig addresses.
    /// @param activityChanges Corresponding activity changes
    function increaseActivity(address[] memory multisigs, uint256[] memory activityChanges) external {
        // Check for whitelisted contribute agent
        if (!mapContributeAgents[msg.sender]) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check for array lengths
        if (multisigs.length != activityChanges.length) {
            revert WrongArrayLength(multisigs.length, activityChanges.length);
        }

        // Increase / decrease multisig activity
        for (uint256 i = 0; i < multisigs.length; ++i) {
            mapMutisigActivities[multisigs[i]] += activityChanges[i];
        }

        emit MultisigActivityChanged(msg.sender, multisigs, activityChanges);
    }
}