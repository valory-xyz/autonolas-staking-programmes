/*global describe, context, beforeEach, it*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

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
    const agentId = 1;
    let socialId = 1;
    const agentIds = [1];
    const agentParams = [[1, regBond]];
    const threshold = 1;
    const livenessPeriod = 10; // Ten seconds
    const initSupply = "5" + "0".repeat(26);
    const rewardRatio = ethers.utils.parseEther("1.5");
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
            stakingTokenAddress, rewardRatio);
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

        // Create wrong service setup
        await serviceManager.create(deployer.address, token.address, defaultHash, agentIds, agentParams, threshold);
        await serviceManager.activateRegistration(serviceId, {value: 1});
        await serviceManager.connect(operator).registerAgents(serviceId, [agentInstances[0].address], agentIds, {value: 1});
        await serviceManager.deploy(serviceId, gnosisSafeMultisig.address, payload);
    });

    context("Initialization", function () {
        it("Failing to initialize with wrong parameters", async function () {
            const DualStakingToken = await ethers.getContractFactory("DualStakingToken");
            await expect(
                DualStakingToken.deploy(AddressZero, AddressZero, AddressZero, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroAddress");
            await expect(
                DualStakingToken.deploy(serviceManager.address, AddressZero, AddressZero, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroAddress");
            await expect(
                DualStakingToken.deploy(serviceManager.address, secondToken.address, AddressZero, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroAddress");
            await expect(
                DualStakingToken.deploy(serviceManager.address, secondToken.address, stakingToken.address, 0)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroValue");
        });
    });

    context("Staking management", function () {
        it.only("Stake and get rewards", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Try to stake with zero second token funds
            await expect(
                dualStakingToken.stake(serviceId)
            ).to.be.revertedWithCustomError(dualStakingToken, "ZeroValue");

            // Fund dualStakingToken contract
            await secondToken.approve(dualStakingToken.address, ethers.utils.parseEther("1"));
            await dualStakingToken.deposit(ethers.utils.parseEther("1"));

            // Approve service for dual staking token
            await serviceRegistry.approve(dualStakingToken.address, serviceId);

            // Get second token amount
            const secondTokenAmount = await dualStakingToken.secondTokenAmount();

            // Approve second token for dual staking token
            await secondToken.approve(dualStakingToken.address, secondTokenAmount);

            // Stake service + token
            await dualStakingToken.stake(serviceId);

            // Increase the time until the next staking epoch
            await helpers.time.increase(livenessPeriod + 100);

            // Try to call checkpoint directly from the staking contract
            await //expect(
                stakingToken.checkpoint()
            //).to.be.revertedWithCustomError(dualTokenActivityChecker, "Locked");

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Mint, stake, unstake", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Create and stake the service
            await contributors.createAndStake(socialId, stakingToken.address, {value: 2});

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            const balanceBefore = await token.balanceOf(deployer.address);

            // Unstake the service with transferring the service back to the contributor
            await contributors.unstake(true);

            const balanceAfter = await token.balanceOf(deployer.address);

            // Check returned token funds
            const balanceDiff = balanceAfter.sub(balanceBefore);
            expect(balanceDiff).to.equal(serviceParams.minStakingDeposit * 2);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Mint, stake, unstake and stake again", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Create and stake the service
            await contributors.createAndStake(socialId, stakingToken.address, {value: 2});

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            const balanceBefore = await token.balanceOf(deployer.address);

            // Unstake the service with transferring the service back to the contributor
            await contributors.unstake(true);

            const balanceAfter = await token.balanceOf(deployer.address);

            // Check returned token funds
            const balanceDiff = balanceAfter.sub(balanceBefore);
            expect(balanceDiff).to.equal(serviceParams.minStakingDeposit * 2);

            // Try to pull already pulled service
            await expect(
                contributors.pullUnbondedService()
            ).to.be.revertedWithCustomError(contributors, "ServiceNotDefined");

            // Approve the service for the contributors
            await serviceRegistry.approve(contributors.address, serviceId);

            // Approve OLAS for contributors again as OLAS was returned during the unstake and unbond
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Stake the service again
            await contributors.stake(socialId, serviceId, stakingToken.address, {value: 2});

            // Check native balance of a contributors contract such that nothing is left on it
            const nativeBalance = await ethers.provider.getBalance(contributors.address);
            expect(nativeBalance).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Mint, stake, unstake and stake again without service collection", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Create and stake the service
            await contributors.createAndStake(socialId, stakingToken.address, {value: 2});

            // Get multisig address
            const multisigAddress = (await contributors.mapAccountServiceInfo(deployer.address)).multisig;

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            let balanceBefore = await token.balanceOf(deployer.address);

            // Unstake the service without transferring the service back to the contributor
            await contributors.unstake(false);

            let balanceAfter = await token.balanceOf(deployer.address);

            // Check returned token funds
            let balanceDiff = balanceAfter.sub(balanceBefore);
            expect(balanceDiff).to.equal(serviceParams.minStakingDeposit * 2);

            // Try to re-stake without approved funds
            await expect(
                contributors.stake(socialId, serviceId, stakingToken.address)
            ).to.be.reverted;

            // Approve OLAS for contributors again as OLAS was returned during the unstake and unbond
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Stake the service again
            await contributors.stake(socialId, serviceId, stakingToken.address, {value: 2});

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            balanceBefore = await token.balanceOf(deployer.address);

            // Unstake the service without transferring the service back to the contributor
            await contributors.unstake(false);

            balanceAfter = await token.balanceOf(deployer.address);

            // Check returned token funds
            balanceDiff = balanceAfter.sub(balanceBefore);
            expect(balanceDiff).to.equal(serviceParams.minStakingDeposit * 2);

            // Pull the service
            await contributors.pullUnbondedService();

            // Try to pull already pulled service again
            await expect(
                contributors.pullUnbondedService()
            ).to.be.revertedWithCustomError(contributors, "ServiceNotDefined");

            // Activate registration
            await token.approve(serviceRegistryTokenUtility.address, serviceParams.minStakingDeposit);
            await serviceManager.activateRegistration(serviceId, {value: 1});

            // Approve the service for the contributors
            await serviceRegistry.approve(contributors.address, serviceId);

            // Try to stake service in a wrong state
            await expect(
                contributors.stake(socialId, serviceId, stakingToken.address, {value: 2})
            ).to.be.revertedWithCustomError(contributors, "WrongServiceState");

            // Register agent instance
            await token.transfer(operator.address, serviceParams.minStakingDeposit);
            await token.connect(operator).approve(serviceRegistryTokenUtility.address, serviceParams.minStakingDeposit);
            await serviceManager.connect(operator).registerAgents(serviceId, [deployer.address], agentIds, {value: 1});

            // Pack the original multisig address
            const data = ethers.utils.solidityPack(["address"], [multisigAddress]);

            // Deploy service
            await serviceManager.deploy(serviceId, gnosisSafeSameAddressMultisig.address, data);

            // Stake deployed service again
            await contributors.stake(socialId, serviceId, stakingToken.address);

            // Try to pull service while it's staked
            await expect(
                contributors.pullUnbondedService()
            ).to.be.revertedWithCustomError(contributors, "WrongServiceSetup");

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            balanceBefore = await token.balanceOf(deployer.address);

            // Unstake the service with transferring the service back to the contributor
            await contributors.unstake(true);

            balanceAfter = await token.balanceOf(deployer.address);

            // Check returned token funds: it's just one minStakingDeposit because the second one must be unbonded directly
            balanceDiff = balanceAfter.sub(balanceBefore);
            expect(balanceDiff).to.equal(serviceParams.minStakingDeposit);

            balanceBefore = await token.balanceOf(operator.address);
            
            // Since operator of the service is not contributors contract, unbond it manually
            await serviceManager.connect(operator).unbond(serviceId);

            balanceAfter = await token.balanceOf(operator.address);
            // Bond balance is returned to the operator
            balanceDiff = balanceAfter.sub(balanceBefore);
            expect(balanceDiff).to.equal(serviceParams.minStakingDeposit);

            // Approve OLAS for contributors again as OLAS was returned during the unstake and unbond
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);
            // Approve the service for the contributors
            await serviceRegistry.approve(contributors.address, serviceId);

            // Stake the service again such that it's activated and registered by contributors
            await contributors.stake(socialId, serviceId, stakingToken.address, {value: 2});

            // Check native balance of a contributors contract such that nothing is left on it
            const nativeBalance = await ethers.provider.getBalance(contributors.address);
            expect(nativeBalance).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Mint, stake, perform activity, claim", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Create and stake the service
            await contributors.createAndStake(socialId, stakingToken.address, {value: 2});

            // Get the user data
            const serviceInfo = await contributors.mapAccountServiceInfo(deployer.address);

            // Perform the service activity
            await contributors.increaseActivity([serviceInfo.multisig], [10]);

            // Increase the time until the next staking epoch
            await helpers.time.increase(livenessPeriod);

            // Call the checkpoint
            await stakingToken.checkpoint();

            const balanceBefore = ethers.BigNumber.from(await token.balanceOf(serviceInfo.multisig));

            // Claim rewards
            await contributors.claim();

            const balanceAfter = ethers.BigNumber.from(await token.balanceOf(serviceInfo.multisig));
            // The balance before and after the claim must be different
            expect(balanceAfter).to.gt(balanceBefore);

            // Check native balance of a contributors contract such that nothing is left on it
            const nativeBalance = await ethers.provider.getBalance(contributors.address);
            expect(nativeBalance).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Mint, stake, re-stake due to inactivity", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Create and stake the service
            await contributors.createAndStake(socialId, stakingToken.address, {value: 2});

            // Try to re-stake correctly staked service
            await expect(
                contributors.reStake(stakingToken.address)
            ).to.be.revertedWithCustomError(contributors, "ServiceAlreadyStaked");

            // Increase the time until the next staking epoch
            await helpers.time.increase(maxInactivity);

            // Call the checkpoint
            await stakingToken.checkpoint();

            // The service is currently evicted, re-stake (unstake and stake again)
            await contributors.reStake(stakingToken.address);

            // Check native balance of a contributors contract such that nothing is left on it
            const nativeBalance = await ethers.provider.getBalance(contributors.address);
            expect(nativeBalance).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Mint, stake, re-stake to another staking contract", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Try to re-stake without initial staking
            await expect(
                contributors.reStake(stakingToken.address)
            ).to.be.revertedWithCustomError(contributors, "ServiceNotDefined");

            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Create and stake the service
            await contributors.createAndStake(socialId, stakingToken.address, {value: 2});

            // Increase the time until unstaking is possible
            await helpers.time.increase(maxInactivity);

            // Call the checkpoint
            await stakingToken.checkpoint();

            // Set up a different staking contract
            const testServiceParams = JSON.parse(JSON.stringify(serviceParams));
            testServiceParams.minStakingDeposit = regDeposit * 2;

            // Deploy staking contract
            let initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
                [testServiceParams, serviceRegistryTokenUtility.address, token.address]);
            let tx = await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
            let res = await tx.wait();
            // Get staking contract instance address from the event
            let nextStakingTokenAddress = "0x" + res.logs[0].topics[2].slice(26);
            let nextStakingToken = await ethers.getContractAt("StakingToken", nextStakingTokenAddress);

            // Fund staking contract
            await token.approve(nextStakingTokenAddress, ethers.utils.parseEther("1"));
            await nextStakingToken.deposit(ethers.utils.parseEther("1"));

            // Try to re-stake to a different contract without increasing approve
            await expect(
                contributors.reStake(nextStakingTokenAddress)
            ).to.be.reverted;

            // Approve more OLAS for contributors
            await token.approve(contributors.address, testServiceParams.minStakingDeposit * 2);

            // The service is currently evicted, re-stake to a different contract
            await contributors.reStake(nextStakingTokenAddress, {value: 2});

            // Increase the time until unstaking is possible
            await helpers.time.increase(maxInactivity);

            // Call the checkpoint
            await nextStakingToken.checkpoint();

            // Set up yet another different staking contract
            testServiceParams.minStakingDeposit = regDeposit / 4;

            initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
                [testServiceParams, serviceRegistryTokenUtility.address, token.address]);
            tx = await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
            res = await tx.wait();
            // Get staking contract instance address from the event
            nextStakingTokenAddress = "0x" + res.logs[0].topics[2].slice(26);
            nextStakingToken = await ethers.getContractAt("StakingToken", nextStakingTokenAddress);

            // Fund staking contract
            await token.approve(nextStakingTokenAddress, ethers.utils.parseEther("1"));
            await nextStakingToken.deposit(ethers.utils.parseEther("1"));

            // Approve fewer OLAS for contributors
            await token.approve(contributors.address, testServiceParams.minStakingDeposit * 2);

            // The service is currently evicted, re-stake to a different contract
            await contributors.reStake(nextStakingTokenAddress, {value: 2});

            // Increase the time until unstaking is possible
            await helpers.time.increase(maxInactivity);

            // Call the checkpoint
            await nextStakingToken.checkpoint();

            let balanceBefore = await token.balanceOf(deployer.address);

            // Unstake the service with transferring the service back to the contributor
            await contributors.unstake(false);

            let balanceAfter = await token.balanceOf(deployer.address);

            // Check returned token funds
            let balanceDiff = balanceAfter.sub(balanceBefore);
            expect(balanceDiff).to.equal(testServiceParams.minStakingDeposit * 2);

            // Check native balance of a contributors contract such that nothing is left on it
            const nativeBalance = await ethers.provider.getBalance(contributors.address);
            expect(nativeBalance).to.equal(0);

            // Restore a previous state of blockchain
            snapshot.restore();
        });
        
        it("Should fail when executing with incorrect values and states", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Try to create a new service with zero social Id
            await expect(
                contributors.createAndStake(0, stakingToken.address, {value: 2})
            ).to.be.revertedWithCustomError(contributors, "ZeroValue");

            // Try to create and stake a new service with wrong staking instance
            await expect(
                contributors.createAndStake(socialId, deployer.address, {value: 2})
            ).to.be.revertedWithCustomError(contributors, "WrongStakingInstance");

            // Create and stake the service
            await contributors.createAndStake(socialId, stakingToken.address, {value: 2});
            
            // Try to create the service again
            await expect(
                contributors.createAndStake(socialId, stakingToken.address, {value: 2})
            ).to.be.revertedWithCustomError(contributors, "ServiceAlreadyStaked");

            // Try to stake the service again
            await expect(
                contributors.stake(socialId, serviceId, stakingToken.address)
            ).to.be.revertedWithCustomError(contributors, "ServiceAlreadyStaked");

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            // Unstake the service with transferring the service back to the contributor
            await contributors.unstake(true);

            // Try to unstake again
            await expect(
                contributors.unstake(true)
            ).to.be.revertedWithCustomError(contributors, "ServiceNotDefined");

            // Try to claim the unstaked service
            await expect(
                contributors.claim()
            ).to.be.revertedWithCustomError(contributors, "ServiceNotDefined");

            // Approve more OLAS for contributors
            await token.approve(serviceRegistryTokenUtility.address, serviceParams.minStakingDeposit * 3);
            await token.connect(operator).approve(serviceRegistryTokenUtility.address, serviceParams.minStakingDeposit * 3);

            // Create wrong service setup
            await serviceManager.create(deployer.address, token.address, defaultHash, agentIds, agentParams, threshold);
            await serviceManager.activateRegistration(serviceId + 1, {value: 1});
            await serviceManager.connect(operator).registerAgents(serviceId + 1, [agentInstances[0].address], agentIds, {value: 1});
            await serviceManager.deploy(serviceId + 1, gnosisSafeMultisig.address, payload);

            // Approve service for the contribute manager
            await serviceRegistry.approve(contributors.address, serviceId + 1);

            // Try to stake with wrong parameters
            await expect(
                contributors.stake(socialId, serviceId + 1, stakingToken.address)
            ).to.be.revertedWithCustomError(contributors, "WrongServiceSetup");

            // Create another wrong service setup
            await serviceManager.create(deployer.address, token.address, defaultHash, agentIds, [[2, regBond]], 2);
            await serviceManager.activateRegistration(serviceId + 2, {value: 1});
            await serviceManager.connect(operator).registerAgents(serviceId + 2, [agentInstances[1].address, agentInstances[2].address],
                [agentId, agentId], {value: 2});
            await serviceManager.deploy(serviceId + 2, gnosisSafeMultisig.address, payload);

            // Approve service for the contribute manager
            await serviceRegistry.approve(contributors.address, serviceId + 2);

            // Try to stake with wrong parameters
            await expect(
                contributors.stake(socialId, serviceId + 2, stakingToken.address)
            ).to.be.revertedWithCustomError(contributors, "WrongServiceSetup");

            // Approve the service for the contributors
            await serviceRegistry.approve(contributors.address, serviceId);

            // Approve OLAS for contributors again as OLAS was returned during the unstake and unbond
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Stake the service again
            await contributors.stake(socialId, serviceId, stakingToken.address, {value: 2});

            // Restore a previous state of blockchain
            snapshot.restore();
        });

        it("Should fail when staking with a wrong instance", async function () {
            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Deploy a staking contract with max number of services equal to one
            const testServiceParams = JSON.parse(JSON.stringify(serviceParams));
            testServiceParams.numAgentInstances = 2;

            let initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
                [testServiceParams, serviceRegistryTokenUtility.address, token.address]);
            let tx = await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
            let res = await tx.wait();
            // Get staking contract instance address from the event
            let stakingTokenAddress = "0x" + res.logs[0].topics[2].slice(26);

            // Fund the staking contract
            let testStakingToken = await ethers.getContractAt("StakingToken", stakingTokenAddress);
            await token.approve(stakingTokenAddress, ethers.utils.parseEther("1"));
            await testStakingToken.deposit(ethers.utils.parseEther("1"));

            // Try to create and stake a new service with wrong num agent instances
            await expect(
                contributors.createAndStake(socialId, stakingTokenAddress, {value: 2})
            ).to.be.revertedWithCustomError(contributors, "WrongStakingInstance");

            // Reset number of agent isntances and update threshold
            testServiceParams.numAgentInstances = 1;
            testServiceParams.threshold = 2;

            initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
                [testServiceParams, serviceRegistryTokenUtility.address, token.address]);
            tx = await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
            res = await tx.wait();
            // Get staking contract instance address from the event
            stakingTokenAddress = "0x" + res.logs[0].topics[2].slice(26);

            // Fund the staking contract
            testStakingToken = await ethers.getContractAt("StakingToken", stakingTokenAddress);
            await token.approve(stakingTokenAddress, ethers.utils.parseEther("1"));
            await testStakingToken.deposit(ethers.utils.parseEther("1"));

            // Try to create and stake a new service with wrong threshold
            await expect(
                contributors.createAndStake(socialId, stakingTokenAddress, {value: 2})
            ).to.be.revertedWithCustomError(contributors, "WrongStakingInstance");

            // Reset threshold
            testServiceParams.threshold = 1;

            // Update the token address
            initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
                [testServiceParams, serviceRegistryTokenUtility.address, deployer.address]);
            tx = await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
            res = await tx.wait();
            // Get staking contract instance address from the event
            stakingTokenAddress = "0x" + res.logs[0].topics[2].slice(26);

            // Fund the staking contract
            testStakingToken = await ethers.getContractAt("StakingToken", stakingTokenAddress);
            await token.approve(stakingTokenAddress, ethers.utils.parseEther("1"));
            await testStakingToken.deposit(ethers.utils.parseEther("1"));

            // Try to create and stake a new service with wrong token
            await expect(
                contributors.createAndStake(socialId, stakingTokenAddress, {value: 2})
            ).to.be.revertedWithCustomError(contributors, "WrongStakingInstance");
        });
    });
});
