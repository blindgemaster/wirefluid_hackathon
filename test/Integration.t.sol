// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

// Real DON contracts — imported through the `don/` remapping that points at
// ../fact/contracts/src. No mocks here: if this test passes, the hackathon
// stack composes cleanly with the live Decentralized Oracle Network repo.
import {PlayerThresholdFeed} from "don/sports/PlayerThresholdFeed.sol";

import "../src/PlayerRegistry.sol";
import "../src/ScholarshipVault.sol";
import "../src/DirectSponsorship.sol";
import "../src/ScholarshipDAO.sol";
import "../src/mocks/MockERC20.sol";

/// @notice End-to-end journey using the **actual** DON PlayerThresholdFeed
/// contract from the `fact` repo. The only thing stubbed is the ERC20 payout
/// token (since any WireFluid stablecoin would do in production).
///
/// Demonstrates:
///   1. DON operator registers a grassroots-cricket threshold on the real feed
///   2. DAO bootstraps, activates a U17 player, and funds a scholarship
///   3. DON aggregator pushes a match-day stat (pranked as the aggregator EOA)
///   4. Anyone triggers claim → player wallet receives funds on next block
///   5. A separate individual sponsor also commits and claims via DirectSponsorship
contract IntegrationTest is Test {
    // DON side
    PlayerThresholdFeed feed;
    address donAdmin = address(0xD0D0);
    address donAggregator = address(0xA66);  // in prod this is DON's Aggregator.sol

    // Hackathon side
    PlayerRegistry registry;
    ScholarshipVault vault;
    ScholarshipDAO dao;
    DirectSponsorship sponsorship;
    MockERC20 token;

    // Humans
    address bootstrap = address(0xB007);
    address attestor = address(0xA77E5);
    address alice = address(0xA1);      // DAO member
    address bob = address(0xB2);        // DAO member
    address sponsor = address(0x5B00);  // individual backer
    address player = address(0xB0B);    // grassroots U17

    bytes32 constant PLAYER_ID = keccak256("PAK-KPK-U17-RASHID-001");
    bytes32 constant RUNS_KEY = keccak256("RUNS_PER_INNINGS");
    bytes32 constant WICKETS_KEY = keccak256("WICKETS_TAKEN");
    bytes32 constant FEED_ID = keccak256("DON-CRICKET-PLAYER-THRESHOLDS");
    bytes32 constant SCHEMA_ID = keccak256("PlayerStatThreshold:v1");

    uint256 constant THRESHOLD_RUNS = 50;
    uint256 constant THRESHOLD_WICKETS = 3;
    uint256 constant DAO_GRANT = 2_000 ether;
    uint256 constant SPONSOR_COMMIT = 500 ether;

    function setUp() public {
        // --- Deploy the actual DON PlayerThresholdFeed ---
        feed = new PlayerThresholdFeed(
            donAdmin,
            FEED_ID,
            SCHEMA_ID,
            donAggregator,
            "Grassroots cricket player thresholds"
        );

        // DON admin registers the on-chain thresholds for the player
        vm.startPrank(donAdmin);
        feed.registerThreshold(PLAYER_ID, RUNS_KEY, THRESHOLD_RUNS);
        feed.registerThreshold(PLAYER_ID, WICKETS_KEY, THRESHOLD_WICKETS);
        vm.stopPrank();

        // --- Deploy the hackathon stack ---
        token = new MockERC20("ScholarshipUSD", "sUSD", 18);
        registry = new PlayerRegistry(bootstrap);
        vault = new ScholarshipVault(
            bootstrap, IERC20(address(token)), IPlayerThresholdFeed(address(feed)), registry
        );
        dao = new ScholarshipDAO(bootstrap, IERC20(address(token)), vault, registry);
        sponsorship = new DirectSponsorship(
            IERC20(address(token)), IPlayerThresholdFeed(address(feed)), registry
        );

        // Hand registry + vault to the DAO
        vm.startPrank(bootstrap);
        registry.transferOwnership(address(dao));
        vault.transferOwnership(address(dao));
        dao.setMemberWeight(alice, 100);
        dao.setMemberWeight(bob, 100);
        vm.stopPrank();

        // Seed treasury + sponsor wallet
        token.mint(address(dao), DAO_GRANT * 10);
        token.mint(sponsor, SPONSOR_COMMIT * 10);
    }

    function test_fullGrassrootsJourney() public {
        // ─── 1. DAO approves a regional attestor ────────────────────────────
        vm.prank(alice);
        uint256 pAttestor = dao.proposeSetAttestor(attestor, true, "KPK federation attestor");
        vm.prank(alice);
        dao.vote(pAttestor, true);
        vm.prank(bob);
        dao.vote(pAttestor, true);
        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        dao.execute(pAttestor);

        // ─── 2. Attestor vouches for player; DAO activates ──────────────────
        vm.prank(attestor);
        registry.register(PLAYER_ID, player, 17, "PAK-KPK");

        vm.prank(alice);
        uint256 pActivate = dao.proposeActivatePlayer(PLAYER_ID, "verified U17 district selection");
        vm.prank(alice);
        dao.vote(pActivate, true);
        vm.prank(bob);
        dao.vote(pActivate, true);
        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        dao.execute(pActivate);
        assertTrue(registry.isActive(PLAYER_ID));

        // ─── 3. DAO funds a runs-milestone scholarship ──────────────────────
        vm.prank(alice);
        uint256 pFund = dao.proposeFundScholarship(
            PLAYER_ID, RUNS_KEY, THRESHOLD_RUNS, DAO_GRANT, "Half-century milestone"
        );
        vm.prank(alice);
        dao.vote(pFund, true);
        vm.prank(bob);
        dao.vote(pFund, true);
        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        dao.execute(pFund);
        assertEq(token.balanceOf(address(vault)), DAO_GRANT);

        // ─── 4. Individual sponsor commits to a wickets-milestone ───────────
        vm.prank(sponsor);
        token.approve(address(sponsorship), type(uint256).max);
        vm.prank(sponsor);
        uint256 commitId = sponsorship.commit(
            PLAYER_ID,
            WICKETS_KEY,
            THRESHOLD_WICKETS,
            SPONSOR_COMMIT,
            uint64(block.timestamp + 60 days),
            "Keep bowling line-and-length, champ."
        );

        // ─── 5. DON aggregator reports match-day stats ──────────────────────
        // In production this call comes from the DON Aggregator contract after
        // multi-source consensus across node operators. Here we prank the EOA
        // the feed was configured with at deploy time.
        vm.startPrank(donAggregator);
        feed.pushStat(PLAYER_ID, RUNS_KEY, 63);       // crosses 50 → triggers
        feed.pushStat(PLAYER_ID, WICKETS_KEY, 4);     // crosses 3 → triggers
        vm.stopPrank();

        // ─── 6. Anyone triggers the payouts ─────────────────────────────────
        assertTrue(vault.isClaimable(1));
        address randomTrigger = address(0xCAFE);
        vm.prank(randomTrigger);
        vault.claim(1);

        vm.prank(randomTrigger);
        sponsorship.claim(commitId);

        // ─── 7. Player has both payouts in their wallet ─────────────────────
        assertEq(token.balanceOf(player), DAO_GRANT + SPONSOR_COMMIT);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(address(sponsorship)), 0);
    }

    function test_donAggregatorGateHoldsWhenWrongCallerPushesStat() public {
        // Prove the PlayerThresholdFeed only accepts stats from the configured
        // aggregator — an attacker can't short-circuit scholarship release.
        vm.expectRevert();
        feed.pushStat(PLAYER_ID, RUNS_KEY, 999);
    }

    function test_vaultRejectsThresholdMismatchAgainstRealFeed() public {
        // If the DAO tries to fund a milestone whose threshold doesn't match
        // what the DON actually has registered, createScholarship reverts.
        vm.prank(alice);
        uint256 pAttestor = dao.proposeSetAttestor(attestor, true, "");
        vm.prank(alice);
        dao.vote(pAttestor, true);
        vm.prank(bob);
        dao.vote(pAttestor, true);
        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        dao.execute(pAttestor);

        vm.prank(attestor);
        registry.register(PLAYER_ID, player, 17, "PAK-KPK");
        vm.prank(alice);
        uint256 pAct = dao.proposeActivatePlayer(PLAYER_ID, "");
        vm.prank(alice);
        dao.vote(pAct, true);
        vm.prank(bob);
        dao.vote(pAct, true);
        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        dao.execute(pAct);

        vm.prank(alice);
        uint256 pFund = dao.proposeFundScholarship(
            PLAYER_ID, RUNS_KEY, 9999 /* wrong */, DAO_GRANT, ""
        );
        vm.prank(alice);
        dao.vote(pFund, true);
        vm.prank(bob);
        dao.vote(pFund, true);
        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        vm.expectRevert(); // ThresholdMismatch bubbles up through the DAO
        dao.execute(pFund);
    }
}
