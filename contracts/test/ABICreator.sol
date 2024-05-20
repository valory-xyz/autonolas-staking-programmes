// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

// Getting ABIs for the Gnosis Safe master copy and proxy contracts
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol";
import "@gnosis.pm/safe-contracts/contracts/libraries/MultiSendCallOnly.sol";

// Getting ABIs for registry contracts
import "../../lib/autonolas-registries/contracts/ComponentRegistry.sol";
import "../../lib/autonolas-registries/contracts/AgentRegistry.sol";
import "../../lib/autonolas-registries/contracts/ServiceRegistry.sol";
import "../../lib/autonolas-registries/contracts/ServiceRegistryTokenUtility.sol";
import "../../lib/autonolas-registries/contracts/multisigs/GnosisSafeMultisig.sol";
import {StakingFactory} from "../../lib/autonolas-registries/contracts/staking/StakingFactory.sol";
import {StakingToken} from "../../lib/autonolas-registries/contracts/staking/StakingToken.sol";
import {StakingNativeToken} from "../../lib/autonolas-registries/contracts/staking/StakingNativeToken.sol";