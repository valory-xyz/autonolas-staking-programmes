/*global describe, context, beforeEach, it*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("Staking Contribute", function () {
    let serviceRegistry;
    let serviceRegistryTokenUtility;
    let operatorWhitelist;
    let serviceManager;
    let token;
    let gnosisSafe;
    let gnosisSafeProxyFactory;
    let fallbackHandler;
    let gnosisSafeMultisig;
    let gnosisSafeSameAddressMultisig;
    let stakingFactory;
    let contributors;
    let contributorsProxy;
    let contributeActivityChecker;
    let contributeManager;
    let recoverer;
    let stakingTokenImplementation;
    let stakingToken;
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
    const refundFactor = ethers.utils.parseEther("1");
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

        const GnosisSafe = await ethers.getContractFactory("GnosisSafe");
        gnosisSafe = await GnosisSafe.deploy();
        await gnosisSafe.deployed();

        const GnosisSafeProxyFactory = await ethers.getContractFactory("GnosisSafeProxyFactory");
        gnosisSafeProxyFactory = await GnosisSafeProxyFactory.deploy();
        await gnosisSafeProxyFactory.deployed();

        const FallbackHandler = await ethers.getContractFactory("DefaultCallbackHandler");
        fallbackHandler = await FallbackHandler.deploy();
        await fallbackHandler.deployed();

        const GnosisSafeMultisig = await ethers.getContractFactory("GnosisSafeMultisig");
        gnosisSafeMultisig = await GnosisSafeMultisig.deploy(gnosisSafe.address, gnosisSafeProxyFactory.address);
        await gnosisSafeMultisig.deployed();

        const GnosisSafeProxy = await ethers.getContractFactory("GnosisSafeProxy");
        const gnosisSafeProxy = await GnosisSafeProxy.deploy(gnosisSafe.address);
        await gnosisSafeProxy.deployed();
        const bytecode = await ethers.provider.getCode(gnosisSafeProxy.address);
        bytecodeHash = ethers.utils.keccak256(bytecode);
        serviceParams.proxyHash = bytecodeHash;

        const GnosisSafeSameAddressMultisig = await ethers.getContractFactory("GnosisSafeSameAddressMultisig");
        gnosisSafeSameAddressMultisig = await GnosisSafeSameAddressMultisig.deploy(bytecodeHash);
        await gnosisSafeSameAddressMultisig.deployed();

        const StakingFactory = await ethers.getContractFactory("StakingFactory");
        stakingFactory = await StakingFactory.deploy(AddressZero);
        await stakingFactory.deployed();

        const Contributors = await ethers.getContractFactory("Contributors");
        contributors = await Contributors.deploy(serviceManager.address, token.address, stakingFactory.address,
            agentId, defaultHash);
        await contributors.deployed();

        const ContributorsProxy = await ethers.getContractFactory("ContributorsProxy");
        let proxyData = contributors.interface.encodeFunctionData("initialize", [gnosisSafeMultisig.address,
            gnosisSafeSameAddressMultisig.address, fallbackHandler.address]);
        contributorsProxy = await ContributorsProxy.deploy(contributors.address, proxyData);
        await contributorsProxy.deployed();
        contributors = await ethers.getContractAt("Contributors", contributorsProxy.address);

        const ContributeActivityChecker = await ethers.getContractFactory("ContributeActivityChecker");
        contributeActivityChecker = await ContributeActivityChecker.deploy(contributors.address, livenessRatio);
        await contributeActivityChecker.deployed();
        serviceParams.activityChecker = contributeActivityChecker.address;

        const StakingToken = await ethers.getContractFactory("StakingToken");
        stakingTokenImplementation = await StakingToken.deploy();
        const initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
            [serviceParams, serviceRegistryTokenUtility.address, token.address]);
        const tx = await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
        const res = await tx.wait();
        // Get staking contract instance address from the event
        const stakingTokenAddress = "0x" + res.logs[0].topics[2].slice(26);
        stakingToken = await ethers.getContractAt("StakingToken", stakingTokenAddress);

        // Set service manager
        await serviceRegistry.changeManager(serviceManager.address);
        await serviceRegistryTokenUtility.changeManager(serviceManager.address);

        // Mint tokens to the service owner and the operator
        await token.mint(deployer.address, initSupply);
        await token.mint(operator.address, initSupply);

        // Whitelist gnosis multisig implementations
        await serviceRegistry.changeMultisigPermission(gnosisSafeMultisig.address, true);
        await serviceRegistry.changeMultisigPermission(gnosisSafeSameAddressMultisig.address, true);

        // Set deployer address to be the agent
        await contributors.setContributeServiceStatuses([deployer.address], [true]);

        // Fund the staking contract
        await token.approve(stakingTokenAddress, ethers.utils.parseEther("1"));
        await stakingToken.deposit(ethers.utils.parseEther("1"));

        // Recovery set of contracts
        const ContributorsDeprecated = await ethers.getContractFactory("ContributorsDeprecated");
        let contributorsDeprecated = await ContributorsDeprecated.deploy();
        await contributorsDeprecated.deployed();

        proxyData = contributorsDeprecated.interface.encodeFunctionData("initialize", []);
        const contributorsProxy2 = await ContributorsProxy.deploy(contributorsDeprecated.address, proxyData);
        await contributorsDeprecated.deployed();
        contributorsDeprecated = await ethers.getContractAt("ContributorsDeprecated", contributorsProxy2.address);

        const ContributeManager = await ethers.getContractFactory("ContributeManager");
        contributeManager = await ContributeManager.deploy(contributorsProxy2.address, serviceManager.address,
            token.address, stakingFactory.address, gnosisSafeMultisig.address, fallbackHandler.address,
            agentId, defaultHash);
        await contributeManager.deployed();

        // Set the manager of contributorsProxy
        await contributorsDeprecated.changeManager(contributeManager.address);

        const Recoverer = await ethers.getContractFactory("RecovererContributeManager");
        // Drainer address is not important for testing
        recoverer = await Recoverer.deploy(token.address, contributeManager.address, serviceRegistry.address,
            serviceRegistryTokenUtility.address, deployer.address, refundFactor);
        await recoverer.deployed();

        // Fund recoverer contract
        await token.mint(recoverer.address, initSupply);
    });

    context("Initialization", function () {
        it("Ownership violations", async function () {
            // Trying to change owner from a non-owner account address
            await expect(
                contributors.connect(operator).changeOwner(operator.address)
            ).to.be.revertedWithCustomError(serviceRegistry, "OwnerOnly");

            // Trying to change owner for the zero address
            await expect(
                contributors.connect(deployer).changeOwner(AddressZero)
            ).to.be.revertedWithCustomError(serviceRegistry, "ZeroAddress");

            // Changing the owner
            await contributors.connect(deployer).changeOwner(operator.address);

            // Trying to change owner from the previous owner address
            await expect(
                contributors.connect(deployer).changeOwner(deployer.address)
            ).to.be.revertedWithCustomError(serviceRegistry, "OwnerOnly");

            // Change the owner back
            await contributors.connect(operator).changeOwner(deployer.address);

            // Trying to change manager from a non-owner account address
            await expect(
                contributors.connect(operator).setContributeServiceStatuses([operator.address], [true])
            ).to.be.revertedWithCustomError(serviceRegistry, "OwnerOnly");

            // Trying to change manager for the zero address
            await expect(
                contributors.connect(deployer).setContributeServiceStatuses([AddressZero], [true])
            ).to.be.revertedWithCustomError(serviceRegistry, "ZeroAddress");

            // Try to increase the service activity not by the whitelisted service multisig
            await expect(
                contributors.connect(operator).increaseActivity([deployer.address], [10])
            ).to.be.revertedWithCustomError(contributors, "UnauthorizedAccount");
            // Wrong array lengths
            await expect(
                contributors.increaseActivity([], [10])
            ).to.be.revertedWithCustomError(contributors, "WrongArrayLength");
            await expect(
                contributors.increaseActivity([deployer.address], [])
            ).to.be.revertedWithCustomError(contributors, "WrongArrayLength");

            // Try to set contribute service multisig statuses not by the owner
            await expect(
                contributors.connect(operator).setContributeServiceStatuses([deployer.address], [true])
            ).to.be.revertedWithCustomError(contributors, "OwnerOnly");
            // Wrong array lengths
            await expect(
                contributors.setContributeServiceStatuses([], [true])
            ).to.be.revertedWithCustomError(contributors, "WrongArrayLength");
            await expect(
                contributors.setContributeServiceStatuses([deployer.address], [])
            ).to.be.revertedWithCustomError(contributors, "WrongArrayLength");
            // Zero addresses
            await expect(
                contributors.setContributeServiceStatuses([AddressZero], [true])
            ).to.be.revertedWithCustomError(contributors, "ZeroAddress");

            // Try to re-initialize the proxy
            await expect(
                contributors.initialize(deployer.address, deployer.address, deployer.address)
            ).to.be.revertedWithCustomError(contributors, "AlreadyInitialized");

            // Try to change implementation not by the owner
            await expect(
                contributors.connect(operator).changeImplementation(deployer.address)
            ).to.be.revertedWithCustomError(contributors, "OwnerOnly");
            // Try to change implementation to the zero address
            await expect(
                contributors.changeImplementation(AddressZero)
            ).to.be.revertedWithCustomError(contributors, "ZeroAddress");

            // Change implementation
            await contributors.changeImplementation(deployer.address);

            // Proxy creation failure
            const ContributorsProxy = await ethers.getContractFactory("ContributorsProxy");
            await expect(
                ContributorsProxy.deploy(AddressZero, payload)
            ).to.be.revertedWithCustomError(contributorsProxy, "ZeroImplementationAddress");
            await expect(
                ContributorsProxy.deploy(deployer.address, payload)
            ).to.be.revertedWithCustomError(contributorsProxy, "ZeroContributorsData");
        });

        it("Failing to initialize with wrong parameters", async function () {
            const Contributors = await ethers.getContractFactory("Contributors");
            await expect(
                Contributors.deploy(AddressZero, token.address, stakingFactory.address, agentId, defaultHash)
            ).to.be.revertedWithCustomError(contributors, "ZeroAddress");
            await expect(
                Contributors.deploy(serviceManager.address, AddressZero, stakingFactory.address, agentId, defaultHash)
            ).to.be.revertedWithCustomError(contributors, "ZeroAddress");
            await expect(
                Contributors.deploy(serviceManager.address, token.address, AddressZero, agentId, defaultHash)
            ).to.be.revertedWithCustomError(contributors, "ZeroAddress");
            await expect(
                Contributors.deploy(serviceManager.address, token.address, stakingFactory.address, 0, defaultHash)
            ).to.be.revertedWithCustomError(contributors, "ZeroValue");
            await expect(
                Contributors.deploy(serviceManager.address, token.address, stakingFactory.address, agentId, HashZero)
            ).to.be.revertedWithCustomError(contributors, "ZeroValue");

            const contributorsTest = await Contributors.deploy(serviceManager.address, token.address,
                stakingFactory.address, agentId, defaultHash);
            await contributorsTest.deployed();

            await expect(
                contributorsTest.initialize(AddressZero, gnosisSafeSameAddressMultisig.address, fallbackHandler.address)
            ).to.be.revertedWithCustomError(contributors, "ZeroAddress");
            await expect(
                contributorsTest.initialize(gnosisSafeMultisig.address, AddressZero, fallbackHandler.address)
            ).to.be.revertedWithCustomError(contributors, "ZeroAddress");
            await expect(
                contributorsTest.initialize(gnosisSafeMultisig.address, gnosisSafeSameAddressMultisig.address, AddressZero)
            ).to.be.revertedWithCustomError(contributors, "ZeroAddress");

            const ContributeActivityChecker = await ethers.getContractFactory("ContributeActivityChecker");
            await expect(
                ContributeActivityChecker.deploy(AddressZero, livenessRatio)
            ).to.be.revertedWithCustomError(ContributeActivityChecker, "ZeroAddress");
            await expect(
                ContributeActivityChecker.deploy(contributorsTest.address, 0)
            ).to.be.revertedWithCustomError(ContributeActivityChecker, "ZeroValue");
        });
    });

    context("Contribute staking management", function () {
        it("Create and stake", async function () {
            // Approve OLAS for contributors
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Create and stake the service
            await contributors.createAndStake(socialId, stakingToken.address, {value: 2});
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

            // Unstake the service with transferring the service beck to the contributor
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

            // Unstake the service with transferring the service back to the contributor
            await contributors.unstake(true);

            // Try to pull already pulled service
            await expect(
                contributors.pullUnbondedService()
            ).to.be.revertedWithCustomError(contributors, "ServiceNotDefined");

            // Approve the service for the contributors
            await serviceRegistry.approve(contributors.address, serviceId);

            // Approve OLAS for contributors again as OLAS was returned during the unstake and unbond
            await token.approve(contributors.address, serviceParams.minStakingDeposit * 2);

            // Stake the service again
            await contributors.stake(socialId, serviceId, stakingToken.address);

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

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            // Unstake the service with transferring the service back to the contributor
            await contributors.unstake(false);

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

            // Unstake the service with transferring the service back to the contributor
            await contributors.unstake(false);

            // Pull the service
            await contributors.pullUnbondedService();

            // Try to pull already pulled service again
            await expect(
                contributors.pullUnbondedService()
            ).to.be.revertedWithCustomError(contributors, "ServiceNotDefined");

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

            // Unstake the service with transferring the service beck to the contributor
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
            await contributors.stake(socialId, serviceId, stakingToken.address);

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

    context("Contribute manager recovery", function () {
        it("Create and stake", async function () {
            // Take a snapshot of the current state of the blockchain
            const snapshot = await helpers.takeSnapshot();

            // Approve OLAS for contributeManager
            await token.approve(contributeManager.address, serviceParams.minStakingDeposit * 2);

            // Create and stake the service
            await contributeManager.createAndStake(socialId, stakingToken.address, {value: 2});

            // Increase the time while the service does not reach the required amount of transactions per second (TPS)
            await helpers.time.increase(maxInactivity);

            // Unstake the service
            await contributeManager.unstake();

            // START RECOVERY PROCEDURE
            // Slash service
            const service = await serviceRegistry.getService(serviceId);
            const multisigAddress = service.multisig;
            const multisig = await ethers.getContractAt("GnosisSafe", multisigAddress);
            const safeContracts = require("@gnosis.pm/safe-contracts");
            const nonce = await multisig.nonce();
            const txHashData = await safeContracts.buildContractCall(serviceRegistryTokenUtility, "slash",
                [[deployer.address], [serviceParams.minStakingDeposit], serviceId], nonce, 0, 0);
            const signMessageData = await safeContracts.safeSignMessage(deployer, multisig, txHashData, 0);

            // Slash the agent instance operator with the correct multisig
            await safeContracts.executeTx(multisig, txHashData, [signMessageData], 0);

            // Check slashed balance
            const slashedBalance = await serviceRegistryTokenUtility.mapSlashedFunds(token.address);
            expect(slashedBalance).to.equal(serviceParams.minStakingDeposit);

            // Terminate the service
            await serviceManager.terminate(serviceId);

            // Trying to unbond service fails
            await expect(
                serviceManager.unbond(serviceId)
            ).to.be.revertedWithCustomError(serviceRegistry, "OperatorHasNoInstances");

            // Get refund
            await recoverer.recover(serviceId);

            // Drain the remainder of recoverer funds
            await recoverer.drain();

            // Change drainer
            await serviceRegistryTokenUtility.changeDrainer(deployer.address);

            // Drain ServiceRegistryTokenUtility
            await serviceRegistryTokenUtility.drain(token.address);

            // Restore a previous state of blockchain
            snapshot.restore();
        });
    });
});
