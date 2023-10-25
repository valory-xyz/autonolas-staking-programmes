/*global describe, context, beforeEach, it*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const safeContracts = require("@gnosis.pm/safe-contracts");

describe("ServiceStakingMechUsage", function () {
    let componentRegistry;
    let agentRegistry;
    let serviceRegistry;
    let serviceRegistryTokenUtility;
    let token;
    let agentMech;
    let gnosisSafe;
    let gnosisSafeProxyFactory;
    let gnosisSafeMultisig;
    let multiSend;
    let serviceStakingMechUsage;
    let serviceStakingTokenMechUsage;
    let signers;
    let deployer;
    let operator;
    let agentInstances;
    let bytecodeHash;
    const AddressZero = ethers.constants.AddressZero;
    const defaultHash = "0x" + "5".repeat(64);
    const bytes32Zero = "0x" + "0".repeat(64);
    const regDeposit = 1000;
    const regBond = 1000;
    const serviceId = 1;
    const agentIds = [1];
    const agentParams = [[1, regBond]];
    const threshold = 1;
    const livenessPeriod = 10; // Ten seconds
    const initSupply = "5" + "0".repeat(26);
    const payload = "0x";
    const serviceParams = {
        maxNumServices: 10,
        rewardsPerSecond: "1" + "0".repeat(15),
        minStakingDeposit: 10,
        livenessPeriod: livenessPeriod, // Ten seconds
        livenessRatio: "1" + "0".repeat(16), // 0.01 transaction per second (TPS)
        numAgentInstances: 1,
        agentIds: [],
        threshold: 0,
        configHash: bytes32Zero
    };

    beforeEach(async function () {
        signers = await ethers.getSigners();
        deployer = signers[0];
        operator = signers[1];

        const ComponentRegistry = await ethers.getContractFactory("ComponentRegistry");
        componentRegistry = await ComponentRegistry.deploy("component", "COMPONENT", "https://localhost/component/");
        await componentRegistry.deployed();

        const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
        agentRegistry = await AgentRegistry.deploy("agent", "AGENT", "https://localhost/agent/", componentRegistry.address);
        await agentRegistry.deployed();

        const ServiceRegistry = await ethers.getContractFactory("ServiceRegistry");
        serviceRegistry = await ServiceRegistry.deploy("service registry", "SERVICE", "https://localhost/service/",
            agentRegistry.address);
        await serviceRegistry.deployed();

        const ServiceRegistryTokenUtility = await ethers.getContractFactory("ServiceRegistryTokenUtility");
        serviceRegistryTokenUtility = await ServiceRegistryTokenUtility.deploy(serviceRegistry.address);
        await serviceRegistry.deployed();

        const Token = await ethers.getContractFactory("ERC20Token");
        token = await Token.deploy();
        await token.deployed();

        const AgentMech = await ethers.getContractFactory("MockAgentMech");
        agentMech = await AgentMech.deploy();
        await agentMech.deployed();

        const GnosisSafe = await ethers.getContractFactory("GnosisSafe");
        gnosisSafe = await GnosisSafe.deploy();
        await gnosisSafe.deployed();

        const GnosisSafeProxyFactory = await ethers.getContractFactory("GnosisSafeProxyFactory");
        gnosisSafeProxyFactory = await GnosisSafeProxyFactory.deploy();
        await gnosisSafeProxyFactory.deployed();

        const GnosisSafeMultisig = await ethers.getContractFactory("GnosisSafeMultisig");
        gnosisSafeMultisig = await GnosisSafeMultisig.deploy(gnosisSafe.address, gnosisSafeProxyFactory.address);
        await gnosisSafeMultisig.deployed();

        const GnosisSafeProxy = await ethers.getContractFactory("GnosisSafeProxy");
        const gnosisSafeProxy = await GnosisSafeProxy.deploy(gnosisSafe.address);
        await gnosisSafeProxy.deployed();
        const bytecode = await ethers.provider.getCode(gnosisSafeProxy.address);
        bytecodeHash = ethers.utils.keccak256(bytecode);

        const MultiSend = await ethers.getContractFactory("MultiSendCallOnly");
        multiSend = await MultiSend.deploy();
        await multiSend.deployed();

        const ServiceStakingMechUsage = await ethers.getContractFactory("ServiceStakingMechUsage");
        serviceStakingMechUsage = await ServiceStakingMechUsage.deploy(serviceParams, serviceRegistry.address,
            bytecodeHash, agentMech.address);
        await serviceStakingMechUsage.deployed();

        const ServiceStakingTokenMechUsage = await ethers.getContractFactory("ServiceStakingTokenMechUsage");
        serviceStakingTokenMechUsage = await ServiceStakingTokenMechUsage.deploy(serviceParams, serviceRegistry.address,
            serviceRegistryTokenUtility.address, token.address, bytecodeHash, agentMech.address);
        await serviceStakingTokenMechUsage.deployed();

        // Set the deployer to be the unit manager by default
        await componentRegistry.changeManager(deployer.address);
        await agentRegistry.changeManager(deployer.address);
        // Set the deployer to be the service manager by default
        await serviceRegistry.changeManager(deployer.address);
        await serviceRegistryTokenUtility.changeManager(deployer.address);

        // Mint tokens to the service owner and the operator
        await token.mint(deployer.address, initSupply);
        await token.mint(operator.address, initSupply);

        // Create component, two agents and two services
        await componentRegistry.create(deployer.address, defaultHash, []);
        await agentRegistry.create(deployer.address, defaultHash, [1]);
        await agentRegistry.create(deployer.address, defaultHash, [1]);
        await serviceRegistry.create(deployer.address, defaultHash, agentIds, agentParams, threshold);
        await serviceRegistry.create(deployer.address, defaultHash, agentIds, agentParams, threshold);

        // Activate registration
        await serviceRegistry.activateRegistration(deployer.address, serviceId, {value: regDeposit});
        await serviceRegistry.activateRegistration(deployer.address, serviceId + 1, {value: regDeposit});

        // Register agent instances
        agentInstances = [signers[2], signers[3], signers[4], signers[5], signers[6], signers[7]];
        await serviceRegistry.registerAgents(operator.address, serviceId, [agentInstances[0].address], agentIds, {value: regBond});
        await serviceRegistry.registerAgents(operator.address, serviceId + 1, [agentInstances[1].address], agentIds, {value: regBond});

        // Whitelist gnosis multisig implementations
        await serviceRegistry.changeMultisigPermission(gnosisSafeMultisig.address, true);

        // Deploy services
        await serviceRegistry.deploy(deployer.address, serviceId, gnosisSafeMultisig.address, payload);
        await serviceRegistry.deploy(deployer.address, serviceId + 1, gnosisSafeMultisig.address, payload);
    });

    context("Initialization", function () {
        it("Should fail when deploying the contract with a zero agent mech address", async function () {
            const ServiceStakingMechUsage = await ethers.getContractFactory("ServiceStakingMechUsage");
            await expect(
                ServiceStakingMechUsage.deploy(serviceParams, serviceRegistry.address, bytecodeHash, AddressZero)
            ).to.be.revertedWithCustomError(ServiceStakingMechUsage, "ZeroMechAgentAddress");

            const ServiceStakingTokenMechUsage = await ethers.getContractFactory("ServiceStakingTokenMechUsage");
            await expect(
                ServiceStakingTokenMechUsage.deploy(serviceParams, serviceRegistry.address,
                    serviceRegistryTokenUtility.address, token.address, bytecodeHash, AddressZero)
            ).to.be.revertedWithCustomError(ServiceStakingTokenMechUsage, "ZeroMechAgentAddress");
        });
    });

    context("Staking and unstaking with Agent Mechs", function () {
        it("Stake and unstake with insufficient requests count activity", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Deposit to the contract
            await deployer.sendTransaction({to: serviceStakingMechUsage.address, value: ethers.utils.parseEther("1")});

            // Approve services
            await serviceRegistry.approve(serviceStakingMechUsage.address, serviceId);

            // Stake the service
            await serviceStakingMechUsage.stake(serviceId);

            // Check that the service is staked
            const isStaked = await serviceStakingMechUsage.isServiceStaked(serviceId);
            expect(isStaked).to.equal(true);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(livenessPeriod);

            // Calculate service staking reward that must be zero
            const reward = await serviceStakingMechUsage.calculateServiceStakingReward(serviceId);
            expect(reward).to.equal(0);

            // Unstake the service
            const balanceBefore = await ethers.provider.getBalance(multisig.address);
            await serviceStakingMechUsage.unstake(serviceId);
            const balanceAfter = await ethers.provider.getBalance(multisig.address);

            // The multisig balance before and after unstake must be the same (zero reward)
            expect(balanceBefore).to.equal(balanceAfter);

            // Check the final serviceIds set to be empty
            const serviceIds = await serviceStakingMechUsage.getServiceIds();
            expect(serviceIds.length).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and unstake with nonce manipulation", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Deposit to the contract
            await deployer.sendTransaction({to: serviceStakingMechUsage.address, value: ethers.utils.parseEther("1")});

            // Approve services
            await serviceRegistry.approve(serviceStakingMechUsage.address, serviceId);

            // Stake the service
            await serviceStakingMechUsage.stake(serviceId);

            // Check that the service is staked
            const isStaked = await serviceStakingMechUsage.isServiceStaked(serviceId);
            expect(isStaked).to.equal(true);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Increase the requests count, but the nonce is not increased
            await agentMech.increaseRequestsCount(service.multisig);

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(livenessPeriod);

            // Calculate service staking reward that must be zero
            const reward = await serviceStakingMechUsage.calculateServiceStakingReward(serviceId);
            expect(reward).to.equal(0);

            // Unstake the service
            const balanceBefore = await ethers.provider.getBalance(multisig.address);
            await serviceStakingMechUsage.unstake(serviceId);
            const balanceAfter = await ethers.provider.getBalance(multisig.address);

            // The multisig balance before and after unstake must be the same (zero reward)
            expect(balanceBefore).to.equal(balanceAfter);

            // Check the final serviceIds set to be empty
            const serviceIds = await serviceStakingMechUsage.getServiceIds();
            expect(serviceIds.length).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and unstake with the service activity and requests count", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Deposit to the contract
            await deployer.sendTransaction({to: serviceStakingMechUsage.address, value: ethers.utils.parseEther("1")});

            // Approve services
            await serviceRegistry.approve(serviceStakingMechUsage.address, serviceId);

            // Stake the first service
            await serviceStakingMechUsage.stake(serviceId);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Make transactions by the service multisig to increase the requests count
            let nonce = await multisig.nonce();
            let txHashData = await safeContracts.buildContractCall(agentMech, "increaseRequestsCount", [multisig.address], nonce, 0, 0);
            let signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Execute one more multisig tx (simulating request execution tx)
            nonce = await multisig.nonce();
            txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time for the liveness period
            await helpers.time.increase(livenessPeriod);

            // Call the checkpoint at this time
            await serviceStakingMechUsage.checkpoint();

            // Execute one more multisig tx
            nonce = await multisig.nonce();
            txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time for the liveness period
            await helpers.time.increase(livenessPeriod);

            // Calculate service staking reward that must be greater than zero
            const reward = await serviceStakingMechUsage.calculateServiceStakingReward(serviceId);
            expect(reward).to.greaterThan(0);

            // Unstake the service
            const balanceBefore = ethers.BigNumber.from(await ethers.provider.getBalance(multisig.address));
            await serviceStakingMechUsage.unstake(serviceId);
            const balanceAfter = ethers.BigNumber.from(await ethers.provider.getBalance(multisig.address));

            // The balance before and after the unstake call must be different
            expect(balanceAfter).to.gt(balanceBefore);

            // Check the final serviceIds set to be empty
            const serviceIds = await serviceStakingMechUsage.getServiceIds();
            expect(serviceIds.length).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and unstake with the service activity with a custom ERC20 token", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve ServiceRegistryTokenUtility
            await token.approve(serviceRegistryTokenUtility.address, initSupply);
            await token.connect(operator).approve(serviceRegistryTokenUtility.address, initSupply);
            // Approve and deposit token to the staking contract
            await token.approve(serviceStakingTokenMechUsage.address, initSupply);
            await serviceStakingTokenMechUsage.deposit(ethers.utils.parseEther("1"));

            // Create a service with the token2 (service Id == 3)
            const sId = 3;
            await serviceRegistry.create(deployer.address, defaultHash, agentIds, [[1, 1]], threshold);
            await serviceRegistryTokenUtility.createWithToken(sId, token.address, agentIds, [regBond]);
            // Activate registration
            await serviceRegistry.activateRegistration(deployer.address, sId, {value: 1});
            await serviceRegistryTokenUtility.activateRegistrationTokenDeposit(sId);
            // Register agents
            await serviceRegistry.registerAgents(operator.address, sId, [agentInstances[2].address], agentIds, {value: 1});
            await serviceRegistryTokenUtility.registerAgentsTokenDeposit(operator.address, sId, agentIds);
            // Deploy the service
            await serviceRegistry.deploy(deployer.address, sId, gnosisSafeMultisig.address, payload);

            // Approve services
            await serviceRegistry.approve(serviceStakingTokenMechUsage.address, sId);

            // Stake the first service
            await serviceStakingTokenMechUsage.stake(sId);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(sId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Make transactions by the service multisig to increase the requests count
            let nonce = await multisig.nonce();
            let txHashData = await safeContracts.buildContractCall(agentMech, "increaseRequestsCount", [multisig.address], nonce, 0, 0);
            let signMessageData = await safeContracts.safeSignMessage(agentInstances[2], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Execute one more multisig tx (simulating request execution tx)
            nonce = await multisig.nonce();
            txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            signMessageData = await safeContracts.safeSignMessage(agentInstances[2], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time for the liveness period
            await helpers.time.increase(livenessPeriod);

            // Call the checkpoint at this time
            await serviceStakingTokenMechUsage.checkpoint();

            // Execute one more multisig tx
            nonce = await multisig.nonce();
            txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            signMessageData = await safeContracts.safeSignMessage(agentInstances[2], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time for the liveness period
            await helpers.time.increase(livenessPeriod);

            // Calculate service staking reward that must be greater than zero
            const reward = await serviceStakingTokenMechUsage.calculateServiceStakingReward(sId);
            expect(reward).to.greaterThan(0);

            // Unstake the service
            const balanceBefore = ethers.BigNumber.from(await token.balanceOf(multisig.address));
            await serviceStakingTokenMechUsage.unstake(sId);
            const balanceAfter = ethers.BigNumber.from(await token.balanceOf(multisig.address));

            // The balance before and after the unstake call must be different
            expect(balanceAfter.gt(balanceBefore));

            // Check the final serviceIds set to be empty
            const serviceIds = await serviceStakingTokenMechUsage.getServiceIds();
            expect(serviceIds.length).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });
    });
});
