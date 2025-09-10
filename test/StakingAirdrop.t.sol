// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";

import {StakingAirdrop} from "contracts/airdrop/StakingAirdrop.sol";
import {ERC20Token} from "contracts/test/ERC20Token.sol";
import {MockServiceRegistryMap} from "contracts/test/MockServiceRegistryMap.sol";

contract StakingAirdropTest is Test {
    ERC20Token token;
    MockServiceRegistryMap registry;
    StakingAirdrop airdrop;
    address owner = address(0xBEEF);
    address other = address(0xCAFE);
    uint256 constant SERVICE_ID = 1;

    function setUp() public {
        token = new ERC20Token();
        registry = new MockServiceRegistryMap();
        registry.setService(SERVICE_ID, 0, owner, bytes32(0), 0, 0, 0, 0);

        uint256[] memory ids = new uint256[](1);
        ids[0] = SERVICE_ID;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 10_000;

        airdrop = new StakingAirdrop(address(token), address(registry), ids, amounts);

        // fund
        token.mint(address(this), 1 ether);
        token.transfer(address(airdrop), 10_000);
    }

    function testConstructorZeroAddress() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = SERVICE_ID;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 10_000;
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress()"));
        new StakingAirdrop(address(0), address(registry), ids, amounts);
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress()"));
        new StakingAirdrop(address(token), address(0), ids, amounts);
    }

    function testConstructorWrongArrayLengthOrEmpty() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = SERVICE_ID;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 9_000;
        amounts[1] = 1_000;
        vm.expectRevert();
        new StakingAirdrop(address(token), address(registry), ids, amounts);
        ids = new uint256[](0);
        amounts = new uint256[](0);
        vm.expectRevert();
        new StakingAirdrop(address(token), address(registry), ids, amounts);
    }

    function testClaimSuccess() public {
        vm.prank(owner);
        airdrop.claim(SERVICE_ID);
        assertEq(token.balanceOf(owner), 10_000);
    }

    function testClaimZeroMultisigReverts() public {
        registry.setService(SERVICE_ID, 0, address(0), bytes32(0), 0, 0, 0, 0);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress()"));
        airdrop.claim(SERVICE_ID);
    }

    function testDoubleClaimRevertsZeroValue() public {
        vm.prank(owner);
        airdrop.claim(SERVICE_ID);
        vm.prank(owner);
        vm.expectRevert();
        airdrop.claim(SERVICE_ID);
    }

    function testOverflowReverts() public {
        // drain contract
        vm.prank(owner);
        airdrop.claim(SERVICE_ID);
        
        uint256[] memory ids = new uint256[](1);
        ids[0] = SERVICE_ID;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 10_000;
        StakingAirdrop another = new StakingAirdrop(address(token), address(registry), ids, amounts);
        vm.prank(owner);
        vm.expectRevert();
        another.claim(SERVICE_ID);
    }

    function testConstructorDuplicateIdsRevert() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = SERVICE_ID;
        ids[1] = SERVICE_ID;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 5_000;
        amounts[1] = 5_000;
        vm.expectRevert(abi.encodeWithSignature("NonZeroValue()"));
        new StakingAirdrop(address(token), address(registry), ids, amounts);
    }

    function testClaimForAllSuccess() public {
        // second service
        uint256 id2 = 2;
        registry.setService(id2, 0, other, bytes32(0), 0, 0, 0, 0);
        
        uint256[] memory ids = new uint256[](2);
        ids[0] = SERVICE_ID;
        ids[1] = id2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 7_000;
        amounts[1] = 3_000;
        StakingAirdrop drop = new StakingAirdrop(address(token), address(registry), ids, amounts);
        token.transfer(address(drop), 10_000);

        vm.prank(owner);
        drop.claimAll();
        assertEq(token.balanceOf(owner), 7_000);
        assertEq(token.balanceOf(other), 3_000);
    }

    function testClaimForAllOverflow() public {
        uint256 id2 = 2;
        registry.setService(id2, 0, other, bytes32(0), 0, 0, 0, 0);
        
        uint256[] memory ids = new uint256[](2);
        ids[0] = SERVICE_ID;
        ids[1] = id2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 7_000;
        amounts[1] = 3_000;
        StakingAirdrop drop = new StakingAirdrop(address(token), address(registry), ids, amounts);
        token.transfer(address(drop), 9_000);

        vm.prank(owner);
        vm.expectRevert();
        drop.claimAll();
    }
}


