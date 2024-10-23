/*global describe, context, beforeEach, it*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const safeContracts = require("@gnosis.pm/safe-contracts");

describe("Staking", function () {
    let componentRegistry;
    let agentRegistry;
    let serviceRegistry;
    let serviceRegistryTokenUtility;
    let operatorWhitelist;
    let serviceManager;
    let token;
    let gnosisSafe;
    let gnosisSafeProxyFactory;
    let fallbackHandler;
    let gnosisSafeMultisig;
    let stakingFactory;
    let contributors;
    let contributorsProxy;
    let contributeManager;
    let contributeActivityChecker;
    let stakingTokenImplementation;
    let stakingToken;
    let signers;
    let deployer;
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

        const StakingFactory = await ethers.getContractFactory("StakingFactory");
        stakingFactory = await StakingFactory.deploy(AddressZero);
        await stakingFactory.deployed();

        const Contributors = await ethers.getContractFactory("Contributors");
        contributors = await Contributors.deploy();
        await contributors.deployed();

        const ContributorsProxy = await ethers.getContractFactory("ContributorsProxy");
        const proxyData = contributors.interface.encodeFunctionData("initialize", []);
        contributorsProxy = await ContributorsProxy.deploy(contributors.address, proxyData);
        await contributorsProxy.deployed();
        contributors = await ethers.getContractAt("Contributors", contributorsProxy.address);

        const ContributeManager = await ethers.getContractFactory("ContributeManager");
        contributeManager = await ContributeManager.deploy(contributorsProxy.address, serviceManager.address,
            token.address, stakingFactory.address, gnosisSafeMultisig.address, fallbackHandler.address,
            agentId, defaultHash);

        const ContributeActivityChecker = await ethers.getContractFactory("ContributeActivityChecker");
        contributeActivityChecker = await ContributeActivityChecker.deploy(contributorsProxy.address, livenessRatio);
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

        // Whitelist gnosis multisig implementations
        await serviceRegistry.changeMultisigPermission(gnosisSafeMultisig.address, true);

        // Set the manager of contributorsProxy
        contributors.changeManager(contributeManager.address);

        // Fund the staking contract
        await token.approve(stakingTokenAddress, ethers.utils.parseEther("1"));
        await stakingToken.deposit(ethers.utils.parseEther("1"));
    });

    context("Initialization", function () {
    });

    context("Contribute manager", function () {
        it.only("Mint and stake", async function () {
            await token.approve(contributeManager.address, serviceParams.minStakingDeposit * 2);

            await contributeManager.createAndStake(socialId, stakingToken.address, {value: 2});
        });
    });
});
