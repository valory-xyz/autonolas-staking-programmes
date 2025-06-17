/*global describe, context, beforeEach, it*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const safeContracts = require("@gnosis.pm/safe-contracts");

describe("Staking Dual Token", function () {
    let serviceRegistry;
    let serviceRegistryTokenUtility;
    let operatorWhitelist;
    let serviceManager;
    let token;
    let secondToken;
    let gnosisSafe;
    let gnosisSafeProxyFactory;
    let gnosisSafeMultisig;
    let stakingFactory;
    let dualTokenActivityChecker;
    let stakingTokenImplementation;
    let stakingToken;
    let dualStakingToken;
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
    const rewardRatio = ethers.utils.parseEther("1.5");
    const stakeRatio = rewardRatio.mul(2);
    const payload = "0x";
    const livenessRatio = "1" + "0".repeat(16); // 0.01 transaction per second (TPS)
    let serviceParams = {
        metadataHash: defaultHash,
        maxNumServices: 3,
        rewardsPerSecond: "1" + "0".repeat(15),
        minStakingDeposit: regDeposit,
        minNumStakingPeriods: 3,
        maxNumInactivityPeriods: 3,
        livenessPeriod: livenessPeriod, // Ten seconds
        timeForEmissions: 100,
        numAgentInstances: 1,
        agentIds: [],
        threshold: 1,
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
        agentInstances = [signers[2], signers[3], signers[4]];

        const ServiceRegistry = await ethers.getContractFactory("ServiceRegistryL2");
        serviceRegistry = await ServiceRegistry.deploy("Service Registry L2", "SERVICE", "https://localhost/service/");
        await serviceRegistry.deployed();
        serviceParams.serviceRegistry = serviceRegistry.address;

        const ServiceRegistryTokenUtility = await ethers.getContractFactory("ServiceRegistryTokenUtility");
        serviceRegistryTokenUtility = await ServiceRegistryTokenUtility.deploy(serviceRegistry.address);
        await serviceRegistry.deployed();

        const OperatorWhitelist = await ethers.getContractFactory("OperatorWhitelist");
        operatorWhitelist = await OperatorWhitelist.deploy(serviceRegistry.address);
        await operatorWhitelist.deployed();

        const ServiceManagerToken = await ethers.getContractFactory("ServiceManagerToken");
        serviceManager = await ServiceManagerToken.deploy(serviceRegistry.address, serviceRegistryTokenUtility.address,
            operatorWhitelist.address);
        await serviceManager.deployed();

        const Token = await ethers.getContractFactory("ERC20Token");
        token = await Token.deploy();
        await token.deployed();

        secondToken = await Token.deploy();
        await secondToken.deployed();

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

        const DualStakingTokenActivityChecker = await ethers.getContractFactory("DualStakingTokenActivityChecker");
        dualTokenActivityChecker = await DualStakingTokenActivityChecker.deploy(livenessRatio);
        await dualTokenActivityChecker.deployed();
        serviceParams.activityChecker = dualTokenActivityChecker.address;

        const StakingToken = await ethers.getContractFactory("StakingToken");
        stakingTokenImplementation = await StakingToken.deploy();
        const initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
            [serviceParams, serviceRegistryTokenUtility.address, token.address]);
        const tx = await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
        const res = await tx.wait();
        // Get staking contract instance address from the event
        const stakingTokenAddress = "0x" + res.logs[0].topics[2].slice(26);
        stakingToken = await ethers.getContractAt("StakingToken", stakingTokenAddress);

        const DualStakingToken = await ethers.getContractFactory("DualStakingToken");
        dualStakingToken = await DualStakingToken.deploy(serviceRegistry.address, secondToken.address,
            stakingTokenAddress, stakeRatio, rewardRatio);
        await dualStakingToken.deployed();

        // Set dual staking token
        await dualTokenActivityChecker.setDualStakingToken(dualStakingToken.address);

        // Set service manager
        await serviceRegistry.changeManager(serviceManager.address);
        await serviceRegistryTokenUtility.changeManager(serviceManager.address);

        // Mint tokens to the service owner and the operator
        await token.mint(deployer.address, initSupply);
        await token.mint(operator.address, initSupply);
        await secondToken.mint(deployer.address, initSupply);

        // Whitelist gnosis multisig implementations
        await serviceRegistry.changeMultisigPermission(gnosisSafeMultisig.address, true);

        // Fund the staking contract
        await token.approve(stakingTokenAddress, ethers.utils.parseEther("1"));
        await stakingToken.deposit(ethers.utils.parseEther("1"));

        // Create first service
        // Approve OLAS for serviceRegistryTokenUtility
        await token.approve(serviceRegistryTokenUtility.address, serviceParams.minStakingDeposit);
        await token.connect(operator).approve(serviceRegistryTokenUtility.address, serviceParams.minStakingDeposit);

        // Create a service
        await serviceManager.create(deployer.address, token.address, defaultHash, agentIds, agentParams, threshold);
        await serviceManager.activateRegistration(serviceId, {value: 1});
        await serviceManager.connect(operator).registerAgents(serviceId, [agentInstances[0].address], agentIds, {value: 1});
        await serviceManager.deploy(serviceId, gnosisSafeMultisig.address, payload);
    });

    context("Initialization", function () {
        it("Failing to initialize with wrong parameters", async function () {
            const DualStakingToken = await ethers.getContractFactory("DualStakingToken");
            await expect(
                DualStakingToken.deploy(AddressZero, AddressZero, AddressZero, 0, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroAddress");
            await expect(
                DualStakingToken.deploy(serviceManager.address, AddressZero, AddressZero, 0, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroAddress");
            await expect(
                DualStakingToken.deploy(serviceManager.address, secondToken.address, AddressZero, 0, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroAddress");
            await expect(
                DualStakingToken.deploy(serviceManager.address, secondToken.address, stakingToken.address, 0, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroValue");
            await expect(
                DualStakingToken.deploy(serviceManager.address, secondToken.address, stakingToken.address, stakeRatio, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroValue");

            // Try to set dual staking token again
            await expect(
                dualTokenActivityChecker.setDualStakingToken(AddressZero)
            ).to.be.revertedWithCustomError(dualTokenActivityChecker, "UnauthorizedAccount");

            const DualStakingTokenActivityChecker = await ethers.getContractFactory("DualStakingTokenActivityChecker");
            const dualTokenActivityCheckerTest = await DualStakingTokenActivityChecker.deploy(livenessRatio);
            await dualTokenActivityCheckerTest.deployed();
            // Try to set zero dual staking token again
            await expect(
                dualTokenActivityCheckerTest.setDualStakingToken(AddressZero)
            ).to.be.revertedWithCustomError(dualTokenActivityCheckerTest, "ZeroAddress");
        });
    });

    context("Staking management", function () {
        it("Stake", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve service for original staking token
            await serviceRegistry.approve(stakingToken.address, serviceId);

            // Try to stake from the original staking contract
            await expect(
                stakingToken.stake(serviceId)
            ).to.be.revertedWithCustomError(dualTokenActivityChecker, "UnauthorizedAccount");

            // Fund dualStakingToken contract
            await secondToken.transfer(dualStakingToken.address, ethers.utils.parseEther("1"));

            // Approve service for dual staking token
            await serviceRegistry.approve(dualStakingToken.address, serviceId);

            // Get second token amount
            const secondTokenAmount = await dualStakingToken.secondTokenAmount();

            // Approve second token for dual staking token
            await secondToken.approve(dualStakingToken.address, secondTokenAmount);

            // Stake service + token
            await dualStakingToken.stake(serviceId);

            // Try to stake again
            await expect(
                dualStakingToken.stake(serviceId)
            ).to.be.revertedWithCustomError(dualStakingToken, "AlreadyStaked");

            const instance = await ethers.getContractAt("StakingToken", dualStakingToken.address);
            const numAgentInstances = await instance.numAgentInstances();
            expect(numAgentInstances).to.equal(serviceParams.numAgentInstances);
            const rewardsPerSecond = await instance.rewardsPerSecond();
            expect(rewardsPerSecond).to.equal(serviceParams.rewardsPerSecond);
            const activityChecker = await instance.activityChecker();
            expect(activityChecker).to.equal(serviceParams.activityChecker);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and claim rewards", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Fund dualStakingToken contract
            await secondToken.transfer(dualStakingToken.address, ethers.utils.parseEther("1"));

            // Approve service for dual staking token
            await serviceRegistry.approve(dualStakingToken.address, serviceId);

            // Get second token amount
            const secondTokenAmount = await dualStakingToken.secondTokenAmount();

            // Approve second token for dual staking token
            await secondToken.approve(dualStakingToken.address, secondTokenAmount);

            // Stake service + token
            await dualStakingToken.stake(serviceId);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Make transactions by the service multisig
            let nonce = await multisig.nonce();
            let txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            let signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time until the next staking epoch
            await helpers.time.increase(livenessPeriod);

            // Calculate service staking reward that must be greater than zero
            const olasReward = await stakingToken.calculateStakingReward(serviceId);
            expect(olasReward).to.greaterThan(0);

            // Call checkpoint
            await dualStakingToken.checkpoint();

            // Try to claim directly from the service staking token
            await expect(
                stakingToken.claim(serviceId)
            ).to.be.revertedWithCustomError(stakingToken, "OwnerOnly");

            // Try to claim not by the owner
            await expect(
                dualStakingToken.connect(operator).claim(serviceId)
            ).to.be.revertedWithCustomError(dualStakingToken, "StakerOnly");

            // Try to claim for non-staked service
            await expect(
                dualStakingToken.claim(serviceId + 1)
            ).to.be.revertedWithCustomError(dualStakingToken, "StakerOnly");

            // Claim rewards
            await dualStakingToken.claim(serviceId);

            // Check multisig second token rewards are non-zero
            const secondTokenReward = await secondToken.balanceOf(multisig.address);
            expect(secondTokenReward).to.greaterThan(0);

            // Try to claim again
            await expect(
                dualStakingToken.claim(serviceId)
            ).to.be.revertedWithCustomError(stakingToken, "ZeroValue");

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and unstake with rewards", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Fund dualStakingToken contract
            await secondToken.transfer(dualStakingToken.address, ethers.utils.parseEther("1"));

            // Approve service for dual staking token
            await serviceRegistry.approve(dualStakingToken.address, serviceId);

            // Get second token amount
            const secondTokenAmount = await dualStakingToken.secondTokenAmount();

            // Approve second token for dual staking token
            await secondToken.approve(dualStakingToken.address, secondTokenAmount);

            // Stake service + token
            await dualStakingToken.stake(serviceId);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Make transactions by the service multisig
            let nonce = await multisig.nonce();
            let txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            let signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time until the max inactivity
            await helpers.time.increase(maxInactivity);

            // Call checkpoint
            await dualStakingToken.checkpoint();

            // Calculate service staking reward that must be greater than zero
            const olasReward = await stakingToken.calculateStakingReward(serviceId);
            expect(olasReward).to.greaterThan(0);

            // Try to unstake directly from the service staking token
            await expect(
                stakingToken.unstake(serviceId)
            ).to.be.revertedWithCustomError(stakingToken, "OwnerOnly");

            // Try to unstake not by the owner
            await expect(
                dualStakingToken.connect(operator).unstake(serviceId)
            ).to.be.revertedWithCustomError(dualStakingToken, "StakerOnly");

            // Try to unstake for non-staked service
            await expect(
                dualStakingToken.unstake(serviceId + 1)
            ).to.be.revertedWithCustomError(dualStakingToken, "StakerOnly");

            // Claim rewards
            await dualStakingToken.unstake(serviceId);

            // Check multisig second token rewards are non-zero
            const secondTokenReward = await secondToken.balanceOf(multisig.address);
            expect(secondTokenReward).to.greaterThan(0);

            // Try to unstake again
            await expect(
                dualStakingToken.unstake(serviceId)
            ).to.be.revertedWithCustomError(dualStakingToken, "StakerOnly");

            // Stake again
            // Approve service for dual staking token
            await serviceRegistry.approve(dualStakingToken.address, serviceId);

            // Approve second token for dual staking token
            await secondToken.approve(dualStakingToken.address, secondTokenAmount);

            // Stake service + token
            await dualStakingToken.stake(serviceId);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and restake after eviction", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Fund dualStakingToken contract
            await secondToken.transfer(dualStakingToken.address, ethers.utils.parseEther("1"));

            // Approve service for dual staking token
            await serviceRegistry.approve(dualStakingToken.address, serviceId);

            // Get second token amount
            const secondTokenAmount = await dualStakingToken.secondTokenAmount();

            // Approve second token for dual staking token
            await secondToken.approve(dualStakingToken.address, secondTokenAmount);

            // Stake service + token
            await dualStakingToken.stake(serviceId);

            // Try to restake service that was just staked
            await expect(
                dualStakingToken.restake(serviceId)
            ).to.be.revertedWithCustomError(dualStakingToken, "WrongStakingState");

            // Increase the time until the max inactivity without any service activity
            await helpers.time.increase(maxInactivity);

            // Call checkpoint, the service is going to be evicted
            await dualStakingToken.checkpoint();

            // Calculate service staking reward that must be greater than zero
            const olasReward = await stakingToken.calculateStakingReward(serviceId);
            expect(olasReward).to.equal(0);

            // Try to unstake directly from the service staking token
            await expect(
                stakingToken.unstake(serviceId)
            ).to.be.revertedWithCustomError(stakingToken, "OwnerOnly");

            // Try to restake not by the owner
            await expect(
                dualStakingToken.connect(operator).restake(serviceId)
            ).to.be.revertedWithCustomError(dualStakingToken, "StakerOnly");

            // Try to restake for non-staked service
            await expect(
                dualStakingToken.restake(serviceId + 1)
            ).to.be.revertedWithCustomError(dualStakingToken, "StakerOnly");

            // Claim rewards
            await dualStakingToken.restake(serviceId);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Stake and claim with limited rewards", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Fund dualStakingToken contract with just 1 wei
            await secondToken.transfer(dualStakingToken.address, 1);

            // Approve service for dual staking token
            await serviceRegistry.approve(dualStakingToken.address, serviceId);

            // Get second token amount
            const secondTokenAmount = await dualStakingToken.secondTokenAmount();

            // Approve second token for dual staking token
            await secondToken.approve(dualStakingToken.address, secondTokenAmount);

            // Stake service + token
            await dualStakingToken.stake(serviceId);

            // Get the service multisig contract
            const service = await serviceRegistry.getService(serviceId);
            const multisig = await ethers.getContractAt("GnosisSafe", service.multisig);

            // Make transactions by the service multisig
            let nonce = await multisig.nonce();
            let txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            let signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time until the next staking epoch
            await helpers.time.increase(livenessPeriod);

            // Calculate service staking reward that must be greater than zero
            let olasReward = await stakingToken.calculateStakingReward(serviceId);
            expect(olasReward).to.greaterThan(0);

            // Call checkpoint
            await dualStakingToken.checkpoint();

            // Claim rewards
            await dualStakingToken.claim(serviceId);

            // Check multisig second token rewards are exactly 1 wei
            let secondTokenReward = await secondToken.balanceOf(multisig.address);
            expect(secondTokenReward).to.equal(1);

            // Perform another round of OLAS service activity
            // Make transactions by the service multisig
            nonce = await multisig.nonce();
            txHashData = await safeContracts.buildContractCall(multisig, "getThreshold", [], nonce, 0, 0);
            signMessageData = await safeContracts.safeSignMessage(agentInstances[0], multisig, txHashData, 0);
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Increase the time until the next staking epoch
            await helpers.time.increase(livenessPeriod);

            // Call checkpoint
            await dualStakingToken.checkpoint();

            // Claim rewards again
            await dualStakingToken.claim(serviceId);

            // Check multisig second token rewards are still the same
            secondTokenReward = await secondToken.balanceOf(multisig.address);
            expect(secondTokenReward).to.equal(1);

            // Increase the time until the next staking epoch
            await helpers.time.increase(livenessPeriod);

            // Call checkpoint
            await dualStakingToken.checkpoint();

            // Unstake
            await dualStakingToken.unstake(serviceId);

            // Check multisig second token rewards are still the same
            secondTokenReward = await secondToken.balanceOf(multisig.address);
            expect(secondTokenReward).to.equal(1);

            // Restore a previous state of blockchain
            snapshot.restore();
        });
    });
});
