// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// Getting ABIs for the Gnosis Safe master copy and proxy contracts
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol";
import "@gnosis.pm/safe-contracts/contracts/handler/DefaultCallbackHandler.sol";
import "@gnosis.pm/safe-contracts/contracts/libraries/MultiSendCallOnly.sol";

// Getting ABIs for registry contracts
import {ComponentRegistry} from "../../lib/autonolas-registries/contracts/ComponentRegistry.sol";
import {AgentRegistry} from "../../lib/autonolas-registries/contracts/AgentRegistry.sol";
import {ServiceRegistry} from "../../lib/autonolas-registries/contracts/ServiceRegistry.sol";
import {OperatorWhitelist} from "../../lib/autonolas-registries/contracts/utils/OperatorWhitelist.sol";
import {ServiceRegistryL2} from "../../lib/autonolas-registries/contracts/ServiceRegistryL2.sol";
import {ServiceRegistryTokenUtility} from "../../lib/autonolas-registries/contracts/ServiceRegistryTokenUtility.sol";
import {ServiceManagerToken} from "../../lib/autonolas-registries/contracts/ServiceManagerToken.sol";
import {GnosisSafeMultisig} from "../../lib/autonolas-registries/contracts/multisigs/GnosisSafeMultisig.sol";
import {StakingFactory} from "../../lib/autonolas-registries/contracts/staking/StakingFactory.sol";
import {StakingToken} from "../../lib/autonolas-registries/contracts/staking/StakingToken.sol";
import {StakingNativeToken} from "../../lib/autonolas-registries/contracts/staking/StakingNativeToken.sol";
import {StakingActivityChecker} from "../../lib/autonolas-registries/contracts/staking/StakingActivityChecker.sol";