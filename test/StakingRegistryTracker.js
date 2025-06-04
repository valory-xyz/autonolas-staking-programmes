/*global describe, context, beforeEach, it*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("Staking Registry Tracker", function () {
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
    let registryTracker;
    let registryTrackerProxy;
    let registryTrackerActivityChecker;
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
    const agentIds = [1];
    const agentParams = [[1, regBond]];
    const threshold = 1;
    const livenessPeriod = 10; // Ten seconds
    const initSupply = "5" + "0".repeat(26);
    const payload = "0x";
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
    const rewardPeriod = 7 * livenessPeriod;

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
        let bytecode = await ethers.provider.getCode(gnosisSafeProxy.address);
        bytecodeHash = ethers.utils.keccak256(bytecode);
        serviceParams.proxyHash = bytecodeHash;

        const GnosisSafeSameAddressMultisig = await ethers.getContractFactory("GnosisSafeSameAddressMultisig");
        gnosisSafeSameAddressMultisig = await GnosisSafeSameAddressMultisig.deploy(bytecodeHash);
        await gnosisSafeSameAddressMultisig.deployed();

        const StakingFactory = await ethers.getContractFactory("StakingFactory");
        stakingFactory = await StakingFactory.deploy(AddressZero);
        await stakingFactory.deployed();

        const RegistryTracker = await ethers.getContractFactory("RegistryTracker");
        registryTracker = await RegistryTracker.deploy(serviceRegistry.address, stakingFactory.address);
        await registryTracker.deployed();

        const RegistryTrackerProxy = await ethers.getContractFactory("RegistryTrackerProxy");
        let proxyData = registryTracker.interface.encodeFunctionData("initialize", [rewardPeriod]);
        registryTrackerProxy = await RegistryTrackerProxy.deploy(registryTracker.address, proxyData);
        await registryTrackerProxy.deployed();
        registryTracker = await ethers.getContractAt("RegistryTracker", registryTrackerProxy.address);

        const RegistryTrackerActivityChecker = await ethers.getContractFactory("RegistryTrackerActivityChecker");
        registryTrackerActivityChecker = await RegistryTrackerActivityChecker.deploy(registryTracker.address);
        await registryTrackerActivityChecker.deployed();
        serviceParams.activityChecker = registryTrackerActivityChecker.address;

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

        // Whitelist activity checker hash
        bytecode = await ethers.provider.getCode(registryTrackerActivityChecker.address);
        bytecodeHash = ethers.utils.keccak256(bytecode);
        await registryTracker.whitelistActivityCheckerHashes([bytecodeHash]);

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
        it("Ownership violations", async function () {
            // Trying to change owner from a non-owner account address
            await expect(
                registryTracker.connect(operator).changeOwner(operator.address)
            ).to.be.revertedWithCustomError(registryTracker, "UnauthorizedAccount");

            // Trying to change owner for the zero address
            await expect(
                registryTracker.connect(deployer).changeOwner(AddressZero)
            ).to.be.revertedWithCustomError(registryTracker, "ZeroAddress");

            // Changing the owner
            await registryTracker.connect(deployer).changeOwner(operator.address);

            // Trying to change owner from the previous owner address
            await expect(
                registryTracker.connect(deployer).changeOwner(deployer.address)
            ).to.be.revertedWithCustomError(registryTracker, "UnauthorizedAccount");

            // Change the owner back
            await registryTracker.connect(operator).changeOwner(deployer.address);

            // Try to set contribute service multisig statuses not by the owner
            await expect(
                registryTracker.connect(operator).whitelistActivityCheckerHashes([HashZero])
            ).to.be.revertedWithCustomError(registryTracker, "UnauthorizedAccount");

            // Zero value
            await expect(
                registryTracker.whitelistActivityCheckerHashes([HashZero])
            ).to.be.revertedWithCustomError(registryTracker, "ZeroValue");

            // Try to re-initialize the proxy
            await expect(
                registryTracker.initialize(0)
            ).to.be.revertedWithCustomError(registryTracker, "AlreadyInitialized");

            // Try to change implementation not by the owner
            await expect(
                registryTracker.connect(operator).changeImplementation(deployer.address)
            ).to.be.revertedWithCustomError(registryTracker, "UnauthorizedAccount");
            // Try to change implementation to the zero address
            await expect(
                registryTracker.changeImplementation(AddressZero)
            ).to.be.revertedWithCustomError(registryTracker, "ZeroAddress");

            // Change implementation
            await registryTracker.changeImplementation(deployer.address);

            // Proxy creation failure
            const RegistryTrackerProxy = await ethers.getContractFactory("RegistryTrackerProxy");
            await expect(
                RegistryTrackerProxy.deploy(AddressZero, payload)
            ).to.be.revertedWithCustomError(registryTrackerProxy, "ZeroImplementationAddress");
            await expect(
                RegistryTrackerProxy.deploy(deployer.address, payload)
            ).to.be.revertedWithCustomError(registryTrackerProxy, "ZeroRegistryTrackerData");
        });

        it("Failing to initialize with wrong parameters", async function () {
            const RegistryTracker = await ethers.getContractFactory("RegistryTracker");
            await expect(
                RegistryTracker.deploy(AddressZero, stakingFactory.address)
            ).to.be.revertedWithCustomError(registryTracker, "ZeroAddress");
            await expect(
                RegistryTracker.deploy(serviceRegistry.address, AddressZero)
            ).to.be.revertedWithCustomError(registryTracker, "ZeroAddress");

            const registryTrackerTest = await RegistryTracker.deploy(serviceRegistry.address, stakingFactory.address);
            await registryTrackerTest.deployed();

            await expect(
                registryTrackerTest.initialize(0)
            ).to.be.revertedWithCustomError(registryTracker, "ZeroValue");

            const RegistryTrackerActivityChecker = await ethers.getContractFactory("RegistryTrackerActivityChecker");
            await expect(
                RegistryTrackerActivityChecker.deploy(AddressZero)
            ).to.be.revertedWithCustomError(RegistryTrackerActivityChecker, "ZeroAddress");
        });
    });

    context("Registry Tracker staking", function () {
        it("Register service after it is staked", async function () {
            // Approve service for registryTracker
            await serviceRegistry.approve(stakingToken.address, serviceId);

            // Stake the service
            await stakingToken.stake(serviceId);

            // Create and stake the service
            await registryTracker.registerServiceMultisig(serviceId, stakingToken.address);
        });
    });

    context("Implementation Management", function () {
        it("Change implementation", async function () {
            // Deploy a new implementation
            const NewRegistryTracker = await ethers.getContractFactory("RegistryTracker");
            const newImplementation = await NewRegistryTracker.deploy(serviceRegistry.address, stakingFactory.address);
            await newImplementation.deployed();

            // Change implementation
            await registryTracker.changeImplementation(newImplementation.address);

            // Verify implementation was changed
            const implementation = await ethers.provider.getStorageAt(
                registryTracker.address,
                "0x74d7566dbc76da138d8eaf64f2774351bdfd8119d17c7d6332c2dc73d31d555a"
            );
            expect("0x" + implementation.toLowerCase().slice(26)).to.equal(newImplementation.address.toLowerCase());
        });

        it("Change implementation unauthorized", async function () {
            const NewRegistryTracker = await ethers.getContractFactory("RegistryTracker");
            const newImplementation = await NewRegistryTracker.deploy(serviceRegistry.address, stakingFactory.address);
            await newImplementation.deployed();

            await expect(
                registryTracker.connect(operator).changeImplementation(newImplementation.address)
            ).to.be.revertedWithCustomError(registryTracker, "UnauthorizedAccount");
        });

        it("Change implementation zero address", async function () {
            await expect(
                registryTracker.changeImplementation(AddressZero)
            ).to.be.revertedWithCustomError(registryTracker, "ZeroAddress");
        });
    });

    context("Reward Period Management", function () {
        it("Change reward period", async function () {
            const newRewardPeriod = rewardPeriod * 2;
            await registryTracker.changeRewardPeriod(newRewardPeriod);
            expect(await registryTracker.rewardPeriod()).to.equal(newRewardPeriod);
        });

        it("Change reward period unauthorized", async function () {
            await expect(
                registryTracker.connect(operator).changeRewardPeriod(rewardPeriod * 2)
            ).to.be.revertedWithCustomError(registryTracker, "UnauthorizedAccount");
        });

        it("Change reward period zero value", async function () {
            await expect(
                registryTracker.changeRewardPeriod(0)
            ).to.be.revertedWithCustomError(registryTracker, "ZeroAddress");
        });
    });

    context("Activity Checker Management", function () {
        it("Whitelist activity checker hashes", async function () {
            const newHash = "0x" + "6".repeat(64);
            await registryTracker.whitelistActivityCheckerHashes([newHash]);
            expect(await registryTracker.mapActivityCheckerHashes(newHash)).to.be.true;
        });

        it("Whitelist activity checker hashes unauthorized", async function () {
            const newHash = "0x" + "6".repeat(64);
            await expect(
                registryTracker.connect(operator).whitelistActivityCheckerHashes([newHash])
            ).to.be.revertedWithCustomError(registryTracker, "UnauthorizedAccount");
        });

        it("Whitelist activity checker hashes zero value", async function () {
            await expect(
                registryTracker.whitelistActivityCheckerHashes([HashZero])
            ).to.be.revertedWithCustomError(registryTracker, "ZeroValue");
        });
    });

    context("Service Registration", function () {
        it("Register multisig with wrong staking instance", async function () {
            // Deploy a simple original activity checker
            const ActivityChecker = await ethers.getContractFactory("StakingActivityChecker");
            const activityChecker = await ActivityChecker.deploy(livenessPeriod);
            await activityChecker.deployed();

            // Set up a different staking contract
            const testServiceParams = JSON.parse(JSON.stringify(serviceParams));
            testServiceParams.activityChecker = activityChecker.address;

            const initPayload = stakingTokenImplementation.interface.encodeFunctionData("initialize",
                [testServiceParams, serviceRegistryTokenUtility.address, token.address]);
            const tx = await stakingFactory.createStakingInstance(stakingTokenImplementation.address, initPayload);
            const res = await tx.wait();
            // Get staking contract instance address from the event
            const testStakingTokenAddress = "0x" + res.logs[0].topics[2].slice(26);
            const testStakingToken = await ethers.getContractAt("StakingToken", testStakingTokenAddress);

            // Fund the staking contract
            await token.approve(testStakingTokenAddress, ethers.utils.parseEther("1"));
            await testStakingToken.deposit(ethers.utils.parseEther("1"));

            // Try to register without staking
            await expect(
                registryTracker.registerServiceMultisig(serviceId, testStakingToken.address)
            ).to.be.revertedWithCustomError(registryTracker, "ZeroAddress");

            // Approve service for registryTracker
            await serviceRegistry.approve(testStakingToken.address, serviceId);

            // Stake the service
            await testStakingToken.stake(serviceId);

            // Try to register with an incorrect activity checker contract
            await expect(
                registryTracker.registerServiceMultisig(serviceId, testStakingToken.address)
            ).to.be.revertedWithCustomError(registryTracker, "WrongStakingInstance");
        });

        it("Register multisig twice", async function () {
            // Approve service for registryTracker
            await serviceRegistry.approve(stakingToken.address, serviceId);

            // Stake the service
            await stakingToken.stake(serviceId);

            // Try to register multisig not by the owner
            await expect(
                registryTracker.connect(operator).registerServiceMultisig(serviceId, stakingToken.address)
            ).to.be.revertedWithCustomError(registryTracker, "UnauthorizedAccount");

            // Move time forward past liveness period
            await helpers.time.increase(livenessPeriod + 1);

            // Call checkpoint
            await stakingToken.checkpoint();

            // First registration
            await registryTracker.registerServiceMultisig(serviceId, stakingToken.address);
            
            // Try to register again
            await expect(
                registryTracker.registerServiceMultisig(serviceId, stakingToken.address)
            ).to.be.revertedWithCustomError(registryTracker, "AlreadyRegistered");
        });
    });

    context("Reward Eligibility", function () {
        it("Check reward eligibility within period", async function () {
            // Approve service for registryTracker
            await serviceRegistry.approve(stakingToken.address, serviceId);

            // Stake the service
            await stakingToken.stake(serviceId);

            // Register multisig
            await registryTracker.registerServiceMultisig(serviceId, stakingToken.address);

            const serviceInfo = await stakingToken.getServiceInfo(serviceId);
            
            // Check eligibility immediately after registration
            const isEligible = await registryTracker.isStakingRewardEligible(serviceInfo.multisig);
            expect(isEligible).to.be.true;
        });

        it("Check reward eligibility after period", async function () {
            // Approve service for registryTracker
            await serviceRegistry.approve(stakingToken.address, serviceId);

            // Stake the service
            await stakingToken.stake(serviceId);

            // Register multisig
            await registryTracker.registerServiceMultisig(serviceId, stakingToken.address);

            const serviceInfo = await stakingToken.getServiceInfo(serviceId);
            
            // Move time forward past reward period
            await helpers.time.increase(rewardPeriod + 1);
            
            // Check eligibility
            const isEligible = await registryTracker.isStakingRewardEligible(serviceInfo.multisig);
            expect(isEligible).to.be.false;
        });

        it("Try to register when evicted", async function () {
            // Approve service for registryTracker
            await serviceRegistry.approve(stakingToken.address, serviceId);

            // Stake the service
            await stakingToken.stake(serviceId);

            // Move time forward past reward period
            await helpers.time.increase(rewardPeriod + 1);

            // Evict the service
            await stakingToken.checkpoint();

            // Register multisig
            await expect(
                registryTracker.registerServiceMultisig(serviceId, stakingToken.address)
            ).to.be.revertedWithCustomError(registryTracker, "WrongStakingState");
        });

        it("Check reward eligibility for unregistered multisig", async function () {
            const isEligible = await registryTracker.isStakingRewardEligible(deployer.address);
            expect(isEligible).to.be.false;
        });
    });
});
