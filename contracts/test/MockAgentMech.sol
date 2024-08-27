// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title MockAgentMech - Smart contract for mocking AgentMech partial functionality.
contract MockAgentMech {
    event requestsCountIncreased(address indexed account, uint256 requestsCount);
    event deliveriesCountIncreased(address indexed account, uint256 deliveriesCount);
    event operatorDeliveriesCountIncreased(address indexed operator, uint256 deliveriesCount);

    // Map of requests counts for corresponding requester
    mapping (address => uint256) public mapRequestCounts;
    // Map of requests counts for corresponding requester
    mapping (address => uint256) public mapDeliveryCounts;
    // Map of requests counts for corresponding operator
    mapping (address => uint256) public mapOperatorDeliveryCounts;


    function increaseRequestsCount(address account) external {
        mapRequestCounts[account]++;
        emit requestsCountIncreased(account, mapRequestCounts[account]);
    }

    function increaseDeliveriesCount(address account) external {
        mapDeliveryCounts[account]++;
        emit deliveriesCountIncreased(account, mapDeliveryCounts[account]);
    }

    function increaseOperatorDeliveriesCount(address operator) external {
        mapOperatorDeliveryCounts[operator]++;
        emit operatorDeliveriesCountIncreased(operator, mapOperatorDeliveryCounts[operator]);
    }

    function getRequestsCount(address account) external view returns (uint256) {
        return mapRequestCounts[account];
    }

    function getDeliveriesCount(address account) external view returns (uint256) {
        return mapDeliveryCounts[account];
    }

    function getOperatorDeliveriesCount(address account) external view returns (uint256) {
        return mapOperatorDeliveryCounts[account];
    }
}
