// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/PlayerRegistry.sol";
import "../src/DirectSponsorship.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockPlayerThresholdFeed.sol";

contract DirectSponsorshipTest is Test {
    PlayerRegistry registry;
    DirectSponsorship sponsorship;
    MockERC20 token;
    MockPlayerThresholdFeed feed;

    address owner = address(0xA11CE);
    address attestor = address(0xA77E5);
    address sponsor = address(0x5B00);
    address player = address(0xB0B);

    bytes32 constant PLAYER_ID = keccak256("PLAYER_MALIK_002");
    bytes32 constant WICKETS_KEY = keccak256("WICKETS_TAKEN");
    uint256 constant THRESHOLD = 5;
    uint256 constant AMOUNT = 500 ether;

    function setUp() public {
        token = new MockERC20("sUSD", "sUSD", 18);
        feed = new MockPlayerThresholdFeed(keccak256("CRICKET_FEED"));
        registry = new PlayerRegistry(owner);
        sponsorship = new DirectSponsorship(IERC20(address(token)), IPlayerThresholdFeed(address(feed)), registry);

        vm.prank(owner);
        registry.setAttestor(attestor, true);
        vm.prank(attestor);
        registry.register(PLAYER_ID, player, 19, "BGD-DHK");
        vm.prank(owner);
        registry.activate(PLAYER_ID);

        feed.registerThreshold(PLAYER_ID, WICKETS_KEY, THRESHOLD);
        token.mint(sponsor, AMOUNT * 10);
        vm.prank(sponsor);
        token.approve(address(sponsorship), type(uint256).max);
    }

    function test_commitThenClaim() public {
        vm.prank(sponsor);
        uint256 id = sponsorship.commit(
            PLAYER_ID, WICKETS_KEY, THRESHOLD, AMOUNT, uint64(block.timestamp + 30 days), "For your first 5-fer, champ!"
        );

        feed.pushStat(PLAYER_ID, WICKETS_KEY, 6);

        vm.prank(address(0xDEAD));
        sponsorship.claim(id);
        assertEq(token.balanceOf(player), AMOUNT);
    }

    function test_reclaimAfterDeadline() public {
        vm.prank(sponsor);
        uint256 id = sponsorship.commit(
            PLAYER_ID, WICKETS_KEY, THRESHOLD, AMOUNT, uint64(block.timestamp + 1 days), ""
        );

        vm.warp(block.timestamp + 2 days);

        uint256 before = token.balanceOf(sponsor);
        vm.prank(sponsor);
        sponsorship.reclaim(id);
        assertEq(token.balanceOf(sponsor), before + AMOUNT);
    }

    function test_reclaimRevertsBeforeDeadline() public {
        vm.prank(sponsor);
        uint256 id = sponsorship.commit(
            PLAYER_ID, WICKETS_KEY, THRESHOLD, AMOUNT, uint64(block.timestamp + 1 days), ""
        );
        vm.prank(sponsor);
        vm.expectRevert();
        sponsorship.reclaim(id);
    }

    function test_cannotReclaimAfterClaim() public {
        vm.prank(sponsor);
        uint256 id = sponsorship.commit(
            PLAYER_ID, WICKETS_KEY, THRESHOLD, AMOUNT, uint64(block.timestamp + 1 days), ""
        );
        feed.pushStat(PLAYER_ID, WICKETS_KEY, 9);
        sponsorship.claim(id);

        vm.warp(block.timestamp + 2 days);
        vm.prank(sponsor);
        vm.expectRevert(abi.encodeWithSelector(DirectSponsorship.AlreadyClaimed.selector, id));
        sponsorship.reclaim(id);
    }

    function test_commitmentsOf_tracksPlayer() public {
        vm.startPrank(sponsor);
        sponsorship.commit(PLAYER_ID, WICKETS_KEY, THRESHOLD, AMOUNT, uint64(block.timestamp + 10 days), "");
        sponsorship.commit(PLAYER_ID, WICKETS_KEY, THRESHOLD, AMOUNT, uint64(block.timestamp + 20 days), "");
        vm.stopPrank();

        uint256[] memory ids = sponsorship.commitmentsOf(PLAYER_ID);
        assertEq(ids.length, 2);
    }
}
