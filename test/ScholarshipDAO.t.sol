// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/PlayerRegistry.sol";
import "../src/ScholarshipVault.sol";
import "../src/ScholarshipDAO.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockPlayerThresholdFeed.sol";

contract ScholarshipDAOTest is Test {
    PlayerRegistry registry;
    ScholarshipVault vault;
    ScholarshipDAO dao;
    MockERC20 token;
    MockPlayerThresholdFeed feed;

    address bootstrap = address(0xA11CE);
    address attestor = address(0xA77E5);
    address alice = address(0xA1);   // DAO member
    address bob = address(0xB2);     // DAO member
    address carol = address(0xC3);   // DAO member
    address player = address(0xB0B);

    bytes32 constant PLAYER_ID = keccak256("PLAYER_KHAN_003");
    bytes32 constant RUNS_KEY = keccak256("RUNS_PER_INNINGS");
    uint256 constant THRESHOLD = 75;
    uint256 constant GRANT = 2_000 ether;

    function setUp() public {
        token = new MockERC20("sUSD", "sUSD", 18);
        feed = new MockPlayerThresholdFeed(keccak256("CRICKET_FEED"));
        registry = new PlayerRegistry(bootstrap);

        // DAO owns the vault + registry so it can dispatch actions
        vault = new ScholarshipVault(bootstrap, IERC20(address(token)), IPlayerThresholdFeed(address(feed)), registry);
        dao = new ScholarshipDAO(bootstrap, IERC20(address(token)), vault, registry);

        vm.startPrank(bootstrap);
        vault.transferOwnership(address(dao));
        registry.transferOwnership(address(dao));

        // Seat three members
        dao.setMemberWeight(alice, 100);
        dao.setMemberWeight(bob, 100);
        dao.setMemberWeight(carol, 100);
        vm.stopPrank();

        // Pre-register DON-side threshold
        feed.registerThreshold(PLAYER_ID, RUNS_KEY, THRESHOLD);

        // Fund the DAO treasury
        token.mint(address(dao), GRANT * 10);
    }

    function _registerAndActivatePlayer() internal {
        // Attestor approval goes through the DAO now
        vm.prank(alice);
        uint256 pid = dao.proposeSetAttestor(attestor, true, "allow regional attestor");

        vm.prank(alice);
        dao.vote(pid, true);
        vm.prank(bob);
        dao.vote(pid, true);
        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        dao.execute(pid);

        vm.prank(attestor);
        registry.register(PLAYER_ID, player, 18, "IND-MUM");

        vm.prank(alice);
        uint256 apid = dao.proposeActivatePlayer(PLAYER_ID, "verified U19 selection");
        vm.prank(alice);
        dao.vote(apid, true);
        vm.prank(bob);
        dao.vote(apid, true);
        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        dao.execute(apid);
    }

    function test_endToEnd_fundsScholarshipThroughDAO() public {
        _registerAndActivatePlayer();

        // Alice proposes to fund a scholarship
        vm.prank(alice);
        uint256 pid = dao.proposeFundScholarship(
            PLAYER_ID, RUNS_KEY, THRESHOLD, GRANT, "Fund U19 Karachi prodigy"
        );

        // Quorum is 20% of 300 = 60 yes weight needed. Alice + Bob = 200 yes.
        vm.prank(alice);
        dao.vote(pid, true);
        vm.prank(bob);
        dao.vote(pid, true);
        vm.prank(carol);
        dao.vote(pid, false);

        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        dao.execute(pid);

        // The vault now holds GRANT and has scholarship id=1
        assertEq(token.balanceOf(address(vault)), GRANT);
        assertEq(vault.nextScholarshipId(), 1);

        // Oracle reports player hit 80 runs — anyone can claim
        feed.pushStat(PLAYER_ID, RUNS_KEY, 80);
        vault.claim(1);
        assertEq(token.balanceOf(player), GRANT);
    }

    function test_execute_revertsBelowQuorum() public {
        _registerAndActivatePlayer();

        vm.prank(alice);
        uint256 pid = dao.proposeFundScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, GRANT, "");

        // With weight distribution alice=100, bob=100, carol=100 (total 300)
        // and quorumBps = 2000 (20%), required = 60. One member's 100 weight clears quorum,
        // so bump quorum so one vote isn't enough.
        // All members vote NO → yesWeight = 0, which is below the 20% quorum.
        vm.prank(alice);
        dao.vote(pid, false);
        vm.prank(bob);
        dao.vote(pid, false);

        vm.warp(block.timestamp + dao.votingPeriod() + 1);
        vm.expectRevert(); // QuorumFailed (0 yes) fires before MajorityFailed
        dao.execute(pid);
    }

    function test_cannotVoteIfNotMember() public {
        _registerAndActivatePlayer();
        vm.prank(alice);
        uint256 pid = dao.proposeFundScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, GRANT, "");
        vm.prank(address(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(ScholarshipDAO.NotMember.selector, address(0xBEEF)));
        dao.vote(pid, true);
    }

    function test_cannotExecuteWhileVotingOpen() public {
        _registerAndActivatePlayer();
        vm.prank(alice);
        uint256 pid = dao.proposeFundScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD, GRANT, "");
        vm.prank(alice);
        dao.vote(pid, true);
        vm.prank(bob);
        dao.vote(pid, true);

        vm.expectRevert(abi.encodeWithSelector(ScholarshipDAO.VotingOpen.selector, pid));
        dao.execute(pid);
    }
}
