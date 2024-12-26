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

/// @dev Wrong length of two arrays.
/// @param numValues1 Number of values in a first array.
/// @param numValues2 Number of values in a second array.
error WrongArrayLength(uint256 numValues1, uint256 numValues2);

/// @dev Account is unauthorized.
/// @param account Account address.
error UnauthorizedAccount(address account);

// Struct for service info
struct ServiceInfo {
    // Social Id
    uint256 socialId;
    // Service Id
    uint256 serviceId;
    // Corresponding service multisig
    address multisig;
    // Staking instance address
    address stakingInstance;
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
    event SetServiceInfoForId(address indexed serviceOwner, uint256 indexed socialId, uint256 indexed serviceId,
        address multisig, address stakingInstance);
    event SetContributeServiceStatuses(address[] contributeServices, bool[] statuses);
    event SetContributeManagerStatuses(address[] contributeManagers, bool[] statuses);
    event MultisigActivityChanged(address indexed senderAgent, address[] multisigs, uint256[] activityChanges);

    // Version number
    string public constant VERSION = "1.0.1";
    // Code position in storage is keccak256("CONTRIBUTORS_PROXY") = "0x8f33b4c48c4f3159dc130f2111086160da6c94439c147bd337ecee0aa81518c7"
    bytes32 public constant CONTRIBUTORS_PROXY = 0x8f33b4c48c4f3159dc130f2111086160da6c94439c147bd337ecee0aa81518c7;

    // Contract owner
    address public owner;
    // Service manager contract address
    address public manager;

    // Mapping of account address => service info
    mapping(address => ServiceInfo) public mapAccountServiceInfo;
    // Mapping of service multisig address => activity
    mapping(address => uint256) public mapMutisigActivities;
    // Mapping of whitelisted contributor agents
    mapping(address => bool) public mapContributeAgents;
    // Mapping of whitelisted contribute managers
    mapping(address => bool) public mapContributeManagers;

    /// @dev Contributors initializer.
    function initialize() external{
        // Check for already initialized
        if (owner != address(0)) {
            revert AlreadyInitialized();
        }

        owner = msg.sender;
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
    ) external {
        // Check for contribute manager access
        if (!mapContributeManagers[msg.sender]) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Set (or remove) multisig for the corresponding social id
        ServiceInfo storage serviceInfo = mapAccountServiceInfo[serviceOwner];
        serviceInfo.socialId = socialId;
        serviceInfo.serviceId = serviceId;
        serviceInfo.multisig = multisig;
        serviceInfo.stakingInstance = stakingInstance;

        emit SetServiceInfoForId(serviceOwner, socialId, serviceId, multisig, stakingInstance);
    }

    /// @dev Sets contribute service multisig statues.
    /// @param contributeServices Contribute service multisig addresses.
    /// @param statuses Corresponding whitelisting statues.
    function setContributeServiceStatuses(address[] memory contributeServices, bool[] memory statuses) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for array lengths
        if (contributeServices.length == 0 || contributeServices.length != statuses.length) {
            revert WrongArrayLength(contributeServices.length, statuses.length);
        }

        // Traverse all contribute service multisigs and statuses
        for (uint256 i = 0; i < contributeServices.length; ++i) {
            // Check for zero addresses
            if (contributeServices[i] == address(0)) {
                revert ZeroAddress();
            }

            mapContributeAgents[contributeServices[i]] = statuses[i];
        }

        emit SetContributeServiceStatuses(contributeServices, statuses);
    }

    /// @dev Sets contribute service multisig statues.
    /// @param contributeManagers Contribute service multisig addresses.
    /// @param statuses Corresponding whitelisting statues.
    function setContributeManagerStatuses(address[] memory contributeManagers, bool[] memory statuses) external {
        // Check for the ownership
        if (msg.sender != owner) {
            revert OwnerOnly(msg.sender, owner);
        }

        // Check for array lengths
        if (contributeManagers.length == 0 || contributeManagers.length != statuses.length) {
            revert WrongArrayLength(contributeManagers.length, statuses.length);
        }

        // Traverse all contribute service multisigs and statuses
        for (uint256 i = 0; i < contributeManagers.length; ++i) {
            // Check for zero addresses
            if (contributeManagers[i] == address(0)) {
                revert ZeroAddress();
            }

            mapContributeManagers[contributeManagers[i]] = statuses[i];
        }

        emit SetContributeManagerStatuses(contributeManagers, statuses);
    }

    /// @dev Increases multisig activity by the contribute service.
    /// @param multisigs Multisig addresses.
    /// @param activityChanges Corresponding activity changes
    function increaseActivity(address[] memory multisigs, uint256[] memory activityChanges) external {
        // Check for whitelisted contribute agent
        if (!mapContributeAgents[msg.sender]) {
            revert UnauthorizedAccount(msg.sender);
        }

        // Check for array lengths
        if (multisigs.length == 0 || multisigs.length != activityChanges.length) {
            revert WrongArrayLength(multisigs.length, activityChanges.length);
        }

        // Increase / decrease multisig activity
        for (uint256 i = 0; i < multisigs.length; ++i) {
            mapMutisigActivities[multisigs[i]] += activityChanges[i];
        }

        emit MultisigActivityChanged(msg.sender, multisigs, activityChanges);
    }
}