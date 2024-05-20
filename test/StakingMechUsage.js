/*global describe, context, beforeEach, it*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const safeContracts = require("@gnosis.pm/safe-contracts");

describe("StakingMechUsage", function () {
    let componentRegistry;
    let agentRegistry;
    let serviceRegistry;
    let serviceRegistryTokenUtility;
    let token;
    let agentMech;
    let gnosisSafe;
    let gnosisSafeProxyFactory;
    let gnosisSafeMultisig;
    let stakingFactory;
    let stakingImplementation;
    let stakingTokenImplementation;
    let stakingNativeToken;
    let stakingToken;
    let stakingActivityChecker;
    let signers;
    let deployer;
    let operator;
    let agentInstances;
    let bytecodeHash;
    const AddressZero = ethers.constants.AddressZero;
    const HashZero = ethers.constants.HashZero;
    const defaultHash = "0x" + "5".repeat(64);
    const regDeposit = 1000;
    const regBond = 1000;
    const serviceId = 1;
    const agentIds = [1];
    const agentParams = [[1, regBond]];
    const threshold = 1;
    const livenessPeriod = 10; // Ten seconds
    const initSupply = "5" + "0".repeat(26);
    const payload = "0x";
    const livenessRatio = "1" + "0".repeat(16); // 0.01 transaction per second (TPS)
    let serviceParams = {
        metadataHash: defaultHash,
        maxNumServices: 3,
        rewardsPerSecond: "1" + "0".repeat(15),
        minStakingDeposit: 10,
        minNumStakingPeriods: 3,
        maxNumInactivityPeriods: 3,
        livenessPeriod: livenessPeriod, // Ten seconds
        timeForEmissions: 100,
        numAgentInstances: 1,
        agentIds: [],
        threshold: 0,
        configHash: HashZero,
        proxyHash: HashZero,
        serviceRegistry: AddressZero,
        activityChecker: AddressZero
    };
    const maxInactivity = serviceParams.maxNumInactivityPeriods * livenessPeriod + 1;

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
        serviceParams.serviceRegistry = serviceRegistry.address;

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
        serviceParams.proxyHash = bytecodeHash;

        const StakingFactory = await ethers.getContractFactory("StakingFactory");
        stakingFactory = await StakingFactory.deploy(AddressZero);
        await stakingFactory.deployed();

        const StakingActivityChecker = await ethers.getContractFactory("MechActivityChecker");
        stakingActivityChecker = await StakingActivityChecker.deploy(agentMech.address, livenessRatio);
        await stakingActivityChecker.deployed();
        serviceParams.activityChecker = stakingActivityChecker.address;

        const StakingNativeToken = await ethers.getContractFactory("StakingNativeToken");
        stakingImplementation = await StakingNativeToken.deploy();
        let initPayload = stakingImplementation.interface.encodeFunctionData("initialize",
            [serviceParams]);
        const stakingAddress = await stakingFactory.callStatic.createStakingInstance(
            stakingImplementation.address, initPayload);
        await stakingFactory.createStakingInstance(stakingImplementation.address, initPayload);
        stakingNativeToken = await ethers.getContractAt("StakingNativeToken", stakingAddress);

        const StakingToken = await ethers.getContractFactory("StakingToken");
        stakingTokenImplementation = await StakingToken.deploy();
        initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
            [serviceParams, serviceRegistryTokenUtility.address, token.address]);
        const stakingTokenAddress = await stakingFactory.callStatic.createStakingInstance(
            stakingTokenImplementation.address, initPayload);
        await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
        stakingToken = await ethers.getContractAt("StakingToken", stakingTokenAddress);

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
            const StakingActivityChecker = await ethers.getContractFactory("MechActivityChecker");
            await expect(
                StakingActivityChecker.deploy(AddressZero, livenessRatio)
            ).to.be.revertedWithCustomError(StakingActivityChecker, "ZeroMechAgentAddress");
        });
    });

    context("Staking and unstaking with Agent Mechs", function () {
        it("Stake and unstake with insufficient requests count activity", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Deposit to the contract
            await deployer.sendTransaction({to: stakingNativeToken.address, value: ethers.utils.parseEther("1")});

            // Approve services
            await serviceRegistry.approve(stakingNativeToken.address, serviceId);

            // Stake the service
            await stakingNativeToken.stake(serviceId);

            // Check that the service is staked
            const stakingState = await stakingNativeToken.getStakingState(serviceId);
            expect(stakingState).to.equal(1);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            // Calculate service staking reward that must be zero
            const reward = await stakingNativeToken.calculateStakingReward(serviceId);
            expect(reward).to.equal(0);

            // Unstake the service
            const balanceBefore = await ethers.provider.getBalance(multisig.address);
            await stakingNativeToken.unstake(serviceId);
            const balanceAfter = await ethers.provider.getBalance(multisig.address);

            // The multisig balance before and after unstake must be the same (zero reward)
            expect(balanceBefore).to.equal(balanceAfter);

            // Check the final serviceIds set to be empty
            const serviceIds = await stakingNativeToken.getServiceIds();
            expect(serviceIds.length).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and unstake with nonce manipulation", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Deposit to the contract
            await deployer.sendTransaction({to: stakingNativeToken.address, value: ethers.utils.parseEther("1")});

            // Approve services
            await serviceRegistry.approve(stakingNativeToken.address, serviceId);

            // Stake the service
            await stakingNativeToken.stake(serviceId);

            // Check that the service is staked
            const stakingState = await stakingNativeToken.getStakingState(serviceId);
            expect(stakingState).to.equal(1);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Increase the requests count, but the nonce is not increased
            await agentMech.increaseRequestsCount(service.multisig);

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            // Calculate service staking reward that must be zero
            const reward = await stakingNativeToken.calculateStakingReward(serviceId);
            expect(reward).to.equal(0);

            // Unstake the service
            const balanceBefore = await ethers.provider.getBalance(multisig.address);
            await stakingNativeToken.unstake(serviceId);
            const balanceAfter = await ethers.provider.getBalance(multisig.address);

            // The multisig balance before and after unstake must be the same (zero reward)
            expect(balanceBefore).to.equal(balanceAfter);

            // Check the final serviceIds set to be empty
            const serviceIds = await stakingNativeToken.getServiceIds();
            expect(serviceIds.length).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and unstake with the service activity and requests count", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Deposit to the contract
            await deployer.sendTransaction({to: stakingNativeToken.address, value: ethers.utils.parseEther("1")});

            // Approve services
            await serviceRegistry.approve(stakingNativeToken.address, serviceId);

            // Stake the first service
            await stakingNativeToken.stake(serviceId);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Make transactions by the service multisig to increase the requests count
            let nonce = await multisig.nonce();
            let txHashData = await safeContracts.buildContractCall(agentMech, "increaseRequestsCount",
                [multisig.address], nonce, 0, 0);
            let signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Execute one more multisig tx (simulating request execution tx)
            nonce = await multisig.nonce();
            txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time for the liveness period
            await helpers.time.increase(maxInactivity);

            // Call the checkpoint at this time
            await stakingNativeToken.checkpoint();

            // Execute one more multisig tx
            nonce = await multisig.nonce();
            txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time for the liveness period
            await helpers.time.increase(maxInactivity);

            // Calculate service staking reward that must be greater than zero
            const reward = await stakingNativeToken.calculateStakingReward(serviceId);
            expect(reward).to.greaterThan(0);

            // Unstake the service
            const balanceBefore = ethers.BigNumber.from(await ethers.provider.getBalance(multisig.address));
            await stakingNativeToken.unstake(serviceId);
            const balanceAfter = ethers.BigNumber.from(await ethers.provider.getBalance(multisig.address));

            // The balance before and after the unstake call must be different
            expect(balanceAfter).to.gt(balanceBefore);

            // Check the final serviceIds set to be empty
            const serviceIds = await stakingNativeToken.getServiceIds();
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
            await token.approve(stakingToken.address, initSupply);
            await stakingToken.deposit(ethers.utils.parseEther("1"));

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
            await serviceRegistry.approve(stakingToken.address, sId);

            // Stake the first service
            await stakingToken.stake(sId);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(sId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Make transactions by the service multisig to increase the requests count
            let nonce = await multisig.nonce();
            let txHashData = await safeContracts.buildContractCall(agentMech, "increaseRequestsCount",
                [multisig.address], nonce, 0, 0);
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
            await stakingToken.checkpoint();

            // Execute one more multisig tx
            nonce = await multisig.nonce();
            txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            signMessageData = await safeContracts.safeSignMessage(agentInstances[2], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time for the liveness period
            await helpers.time.increase(maxInactivity);

            // Calculate service staking reward that must be greater than zero
            const reward = await stakingToken.calculateStakingReward(sId);
            expect(reward).to.greaterThan(0);

            // Unstake the service
            const balanceBefore = ethers.BigNumber.from(await token.balanceOf(multisig.address));
            await stakingToken.unstake(sId);
            const balanceAfter = ethers.BigNumber.from(await token.balanceOf(multisig.address));

            // The balance before and after the unstake call must be different
            expect(balanceAfter.gt(balanceBefore));

            // Check the final serviceIds set to be empty
            const serviceIds = await stakingToken.getServiceIds();
            expect(serviceIds.length).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });
    });
});
