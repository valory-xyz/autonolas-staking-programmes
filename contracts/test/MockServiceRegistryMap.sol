// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract MockServiceRegistryMap {
    struct Service {
        uint96 securityDeposit;
        address multisig;
        bytes32 configHash;
        uint32 threshold;
        uint32 maxNumAgentInstances;
        uint32 numAgentInstances;
        uint8 state;
    }

    mapping(uint256 => Service) public services;

    function setService(
        uint256 serviceId,
        uint96 securityDeposit,
        address multisig,
        bytes32 configHash,
        uint32 threshold,
        uint32 maxNumAgentInstances,
        uint32 numAgentInstances,
        uint8 state
    ) external {
        services[serviceId] = Service({
            securityDeposit: securityDeposit,
            multisig: multisig,
            configHash: configHash,
            threshold: threshold,
            maxNumAgentInstances: maxNumAgentInstances,
            numAgentInstances: numAgentInstances,
            state: state
        });
    }

    function mapServices(uint256 serviceId)
        external
        view
        returns (
            uint96 securityDeposit,
            address multisig,
            bytes32 configHash,
            uint32 threshold,
            uint32 maxNumAgentInstances,
            uint32 numAgentInstances,
            uint8 state
        )
    {
        Service memory s = services[serviceId];
        return (
            s.securityDeposit,
            s.multisig,
            s.configHash,
            s.threshold,
            s.maxNumAgentInstances,
            s.numAgentInstances,
            s.state
        );
    }
}


