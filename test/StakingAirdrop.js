/*global describe, it, beforeEach*/
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingAirdrop", function () {
    let token;
    let serviceRegistry;
    let airdrop;
    let deployer;
    let other;
    const serviceId = 1;
    const airdropAmount = 10000;

    beforeEach(async function () {
        [deployer, other] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("ERC20Token");
        token = await Token.deploy();
        await token.deployed();

        const MockServiceRegistry = await ethers.getContractFactory("MockServiceRegistryMap");
        serviceRegistry = await MockServiceRegistry.deploy();
        await serviceRegistry.deployed();
        await serviceRegistry.setService(serviceId, 0, deployer.address, ethers.constants.HashZero, 0, 0, 0, 0);

        const StakingAirdrop = await ethers.getContractFactory("StakingAirdrop");
        airdrop = await StakingAirdrop.deploy(
            token.address,
            serviceRegistry.address,
            [serviceId],
            [airdropAmount]
        );
        await airdrop.deployed();

        // fund airdrop
        await token.mint(deployer.address, ethers.utils.parseEther("1"));
        await token.transfer(airdrop.address, airdropAmount);
    });

    it("constructor reverts on zero addresses", async function () {
        const StakingAirdrop = await ethers.getContractFactory("StakingAirdrop");
        await expect(
            StakingAirdrop.deploy(ethers.constants.AddressZero, serviceRegistry.address, [serviceId], [airdropAmount])
        ).to.be.revertedWithCustomError(airdrop, "ZeroAddress");
        await expect(
            StakingAirdrop.deploy(token.address, ethers.constants.AddressZero, [serviceId], [airdropAmount])
        ).to.be.revertedWithCustomError(airdrop, "ZeroAddress");
        await expect(
            StakingAirdrop.deploy(token.address, serviceRegistry.address, [serviceId], [0])
        ).to.be.revertedWithCustomError(airdrop, "ZeroValue");

    });

    it("constructor reverts on wrong array length or empty", async function () {
        const StakingAirdrop = await ethers.getContractFactory("StakingAirdrop");
        await expect(
            StakingAirdrop.deploy(token.address, serviceRegistry.address, [serviceId], [9000, 1000])
        ).to.be.revertedWithCustomError(airdrop, "WrongArrayLength");
        await expect(
            StakingAirdrop.deploy(token.address, serviceRegistry.address, [], [])
        ).to.be.revertedWithCustomError(airdrop, "WrongArrayLength");
    });

    it("claim success and emits event to multisig", async function () {
        const balanceBefore = await token.balanceOf(deployer.address);

        await expect(airdrop.claim(serviceId))
            .to.emit(airdrop, "Claimed")
            .withArgs(deployer.address, serviceId, deployer.address, "10000");

        const balanceAfter = await token.balanceOf(deployer.address);
        const balanceDiff = balanceAfter.sub(balanceBefore);
        expect(balanceDiff).to.equal("10000");
    });

    it("claim reverts when multisig is zero address", async function () {
        await serviceRegistry.setService(serviceId, 0, ethers.constants.AddressZero, ethers.constants.HashZero, 0, 0, 0, 0);
        await expect(airdrop.claim(serviceId)).to.be.revertedWithCustomError(airdrop, "ZeroAddress");
    });

    it("double claim reverts with ZeroValue", async function () {
        await airdrop.claim(serviceId);
        await expect(airdrop.claim(serviceId)).to.be.revertedWithCustomError(airdrop, "ZeroValue");
    });

    it("overflow reverts when contract underfunded", async function () {
        const StakingAirdrop = await ethers.getContractFactory("StakingAirdrop");
        const another = await StakingAirdrop.deploy(
            token.address,
            serviceRegistry.address,
            [serviceId],
            [10000]
        );
        await another.deployed();
        // do not fund
        await expect(another.claim(serviceId)).to.be.revertedWithCustomError(another, "Overflow");
    });

    it("constructor reverts on duplicate service Ids (NonZeroValue)", async function () {
        const StakingAirdrop = await ethers.getContractFactory("StakingAirdrop");
        await expect(
            StakingAirdrop.deploy(token.address, serviceRegistry.address, [serviceId, serviceId], [5000, 5000])
        ).to.be.revertedWithCustomError(airdrop, "NonZeroValue");
    });

    it("claimAll transfers to multisigs and emits events", async function () {
        // set multiple ids
        const id2 = 2;
        await serviceRegistry.setService(id2, 0, other.address, ethers.constants.HashZero, 0, 0, 0, 0);

        const StakingAirdrop = await ethers.getContractFactory("StakingAirdrop");
        const drop = await StakingAirdrop.deploy(
            token.address,
            serviceRegistry.address,
            [serviceId, id2],
            [7000, 3000]
        );
        await drop.deployed();
        await token.transfer(drop.address, 10000);

        const balanceBefore = await token.balanceOf(deployer.address);
        const balanceBefore2 = await token.balanceOf(other.address);

        await expect(drop.claimAll())
            .to.emit(drop, "Claimed").withArgs(deployer.address, serviceId, deployer.address, "7000")
            .and.to.emit(drop, "Claimed").withArgs(deployer.address, id2, other.address, "3000");

        const balanceAfter = await token.balanceOf(deployer.address);
        const balanceAfter2 = await token.balanceOf(other.address);
        const balanceDiff = balanceAfter.sub(balanceBefore);
        const balanceDiff2 = balanceAfter2.sub(balanceBefore2);

        expect(balanceDiff).to.equal(7000);
        expect(balanceDiff2).to.equal(3000);
    });

    it("claimAll skips zero amounts and reverts if total overflow", async function () {
        const id2 = 2;
        await serviceRegistry.setService(id2, 0, other.address, ethers.constants.HashZero, 0, 0, 0, 0);

        const StakingAirdrop = await ethers.getContractFactory("StakingAirdrop");
        const drop = await StakingAirdrop.deploy(
            token.address,
            serviceRegistry.address,
            [serviceId, id2],
            [7000, 3000]
        );
        await drop.deployed();
        // fund insufficiently
        await token.transfer(drop.address, 9000);
        await expect(drop.claimAll()).to.be.revertedWithCustomError(drop, "Overflow");
    });

    it("claimAll for multiple services", async function () {
        // set multiple ids
        const numServiceIds = 10;
        let serviceIds = new Array(numServiceIds);
        let amounts = new Array(numServiceIds);
        for (let i = 1; i <= numServiceIds; i++) {
            await serviceRegistry.setService(i, 0, deployer.address, ethers.constants.HashZero, 0, 0, 0, 0);
            serviceIds[i - 1] = i;
            amounts[i - 1] = 1000 * i;
        }

        const StakingAirdrop = await ethers.getContractFactory("StakingAirdrop");
        const drop = await StakingAirdrop.deploy(
            token.address,
            serviceRegistry.address,
            serviceIds,
            amounts
        );
        await drop.deployed();

        // Fund airdrop contract
        const totalAmount = await drop.airdropAmount();
        await token.transfer(drop.address, totalAmount);

        // Claim service Id 5 and 7
        await drop.claim(5);
        await drop.claim(7);

        // Now claim the rest
        await drop.claimAll();

        // The drop contract balance must be zero after all the claims
        const balanceAfter = await token.balanceOf(drop.address);
        expect(balanceAfter).to.equal(0);

        // Fund airdrop contract once again
        await token.transfer(drop.address, totalAmount);

        // Try to claim
        await expect(
            drop.claim(5)
        ).to.be.revertedWithCustomError(drop, "ZeroValue");
        await expect(
            drop.claimAll()
        ).to.be.revertedWithCustomError(drop, "ZeroValue");
    });
});


