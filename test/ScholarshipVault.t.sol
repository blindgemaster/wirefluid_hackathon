// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/PlayerRegistry.sol";
import "../src/ScholarshipVault.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockPlayerThresholdFeed.sol";

contract ScholarshipVaultTest is Test {
    PlayerRegistry registry;
    ScholarshipVault vault;
    MockERC20 token;
    MockPlayerThresholdFeed feed;

    address owner = address(0xA11CE);
    address attestor = address(0xA77E5);
    address funder = address(0xF00D);
    address player = address(0xB0B);

    bytes32 constant PLAYER_ID = keccak256("PLAYER_RASHID_001");
    bytes32 constant RUNS_KEY = keccak256("RUNS_PER_INNINGS");
    uint256 constant THRESHOLD = 50;
    uint256 constant PAYOUT = 1_000 ether;

    function setUp() public {
        token = new MockERC20("ScholarshipUSD", "sUSD", 18);
        feed = new MockPlayerThresholdFeed(keccak256("CRICKET_FEED"));
        registry = new PlayerRegistry(owner);
        vault = new ScholarshipVault(owner, IERC20(address(token)), IPlayerThresholdFeed(address(feed)), registry);

        // Bootstrap registry
        vm.startPrank(owner);
        registry.setAttestor(attestor, true);
        vm.stopPrank();

        vm.prank(attestor);
        registry.register(PLAYER_ID, player, 17, "PAK-KPK");

        vm.prank(owner);
        registry.activate(PLAYER_ID);

        // DON-side: register threshold
        feed.registerThreshold(PLAYER_ID, RUNS_KEY, THRESHOLD);

        // Fund the funder and approve the vault
        token.mint(funder, PAYOUT * 10);
        vm.prank(funder);
        token.approve(address(vault), type(uint256).max);
    }

    function test_createScholarship_pullsFunds() public {
        vm.prank(funder);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, PAYOUT);

        assertEq(id, 1);
        assertEq(token.balanceOf(address(vault)), PAYOUT);
        assertEq(token.balanceOf(funder), PAYOUT * 10 - PAYOUT);
        assertFalse(vault.isClaimable(id));
    }

    function test_claim_releasesToPlayerWalletWhenThresholdMet() public {
        vm.prank(funder);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, PAYOUT);

        // Oracle reports player scored 63 runs
        feed.pushStat(PLAYER_ID, RUNS_KEY, 63);
        assertTrue(vault.isClaimable(id));

        // Anyone can trigger the claim
        address someone = address(0xCAFE);
        vm.prank(someone);
        vault.claim(id);

        assertEq(token.balanceOf(player), PAYOUT);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_claim_revertsWhenThresholdNotMet() public {
        vm.prank(funder);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, PAYOUT);

        feed.pushStat(PLAYER_ID, RUNS_KEY, 30);

        vm.expectRevert(
            abi.encodeWithSelector(ScholarshipVault.ThresholdNotMet.selector, PLAYER_ID, RUNS_KEY)
        );
        vault.claim(id);
    }

    function test_claim_revertsWhenPlayerSuspended() public {
        vm.prank(funder);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, PAYOUT);

        feed.pushStat(PLAYER_ID, RUNS_KEY, 99);

        vm.prank(owner);
        registry.suspend(PLAYER_ID, "age fraud");

        vm.expectRevert(abi.encodeWithSelector(ScholarshipVault.PlayerNotActive.selector, PLAYER_ID));
        vault.claim(id);
    }

    function test_claim_revertsOnSecondCall() public {
        vm.prank(funder);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, PAYOUT);
        feed.pushStat(PLAYER_ID, RUNS_KEY, 99);
        vault.claim(id);

        vm.expectRevert(abi.encodeWithSelector(ScholarshipVault.AlreadyClaimed.selector, id));
        vault.claim(id);
    }

    function test_createScholarship_revertsOnThresholdMismatch() public {
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(ScholarshipVault.ThresholdMismatch.selector, 100, THRESHOLD));
        vault.createScholarship(PLAYER_ID, RUNS_KEY, 100, PAYOUT);
    }

    function test_cancel_refundsFunder() public {
        vm.prank(funder);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, PAYOUT);

        uint256 before = token.balanceOf(funder);
        vm.prank(funder);
        vault.cancel(id);
        assertEq(token.balanceOf(funder), before + PAYOUT);
    }

    function test_cancel_cannotClaimAfter() public {
        vm.prank(funder);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, PAYOUT);
        vm.prank(funder);
        vault.cancel(id);

        feed.pushStat(PLAYER_ID, RUNS_KEY, 99);
        vm.expectRevert(abi.encodeWithSelector(ScholarshipVault.Cancelled.selector, id));
        vault.claim(id);
    }

    function test_topUp_increasesAmount() public {
        vm.prank(funder);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, PAYOUT);

        vm.prank(funder);
        vault.topUp(id, PAYOUT);

        feed.pushStat(PLAYER_ID, RUNS_KEY, 99);
        vault.claim(id);
        assertEq(token.balanceOf(player), PAYOUT * 2);
    }
}
