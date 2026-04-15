// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./common/ReentrancyGuard.sol";
import "./common/SafeTransfer.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IPlayerThresholdFeed.sol";
import "./PlayerRegistry.sol";

/// @notice 1-to-1 sponsor → player commitments with no DAO vote in the loop.
/// A sponsor (individual, brand, alumni) escrows funds for a specific player +
/// milestone. Same oracle-gated release as the DAO vault, just without governance.
///
/// This is the "individual commitments from users" angle of the hackathon brief:
/// anyone can back a grassroots player directly, and the oracle decides payout.
contract DirectSponsorship is ReentrancyGuard {
    using SafeTransfer for IERC20;

    struct Commitment {
        address sponsor;
        bytes32 playerId;
        bytes32 statKey;
        uint256 threshold;
        uint256 amount;
        uint64 deadline;     // if not claimed by then, sponsor can reclaim
        string message;      // optional public dedication (coach shout-out, etc.)
        bool claimed;
        bool reclaimed;
    }

    IERC20 public immutable token;
    IPlayerThresholdFeed public immutable feed;
    PlayerRegistry public immutable registry;

    uint256 public nextCommitmentId;
    mapping(uint256 => Commitment) public commitments;

    // playerId => list of commitment ids (helps the UI enumerate sponsors for a player)
    mapping(bytes32 => uint256[]) private _byPlayer;

    error ZeroAmount();
    error BadDeadline();
    error UnknownCommitment(uint256 id);
    error AlreadyClaimed(uint256 id);
    error AlreadyReclaimed(uint256 id);
    error PlayerNotActive(bytes32 playerId);
    error ThresholdMismatch(uint256 expected, uint256 actual);
    error ThresholdNotMet(bytes32 playerId, bytes32 statKey);
    error DeadlineNotPassed(uint64 deadline);
    error NotSponsor(address caller);

    event Committed(
        uint256 indexed id,
        address indexed sponsor,
        bytes32 indexed playerId,
        bytes32 statKey,
        uint256 threshold,
        uint256 amount,
        uint64 deadline,
        string message
    );
    event Claimed(uint256 indexed id, bytes32 indexed playerId, address payoutWallet, uint256 amount);
    event Reclaimed(uint256 indexed id, address indexed sponsor, uint256 amount);

    constructor(IERC20 _token, IPlayerThresholdFeed _feed, PlayerRegistry _registry) {
        token = _token;
        feed = _feed;
        registry = _registry;
    }

    function commit(
        bytes32 playerId,
        bytes32 statKey,
        uint256 threshold,
        uint256 amount,
        uint64 deadline,
        string calldata message
    ) external nonReentrant returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert BadDeadline();

        (uint256 onchainThreshold, bool exists) = feed.getThreshold(playerId, statKey);
        if (!exists) revert ThresholdMismatch(threshold, 0);
        if (onchainThreshold != threshold) revert ThresholdMismatch(threshold, onchainThreshold);

        id = ++nextCommitmentId;
        commitments[id] = Commitment({
            sponsor: msg.sender,
            playerId: playerId,
            statKey: statKey,
            threshold: threshold,
            amount: amount,
            deadline: deadline,
            message: message,
            claimed: false,
            reclaimed: false
        });
        _byPlayer[playerId].push(id);

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Committed(id, msg.sender, playerId, statKey, threshold, amount, deadline, message);
    }

    /// @notice Anyone can claim once the oracle says the threshold is met.
    function claim(uint256 id) external nonReentrant {
        Commitment storage c = commitments[id];
        if (c.sponsor == address(0)) revert UnknownCommitment(id);
        if (c.claimed) revert AlreadyClaimed(id);
        if (c.reclaimed) revert AlreadyReclaimed(id);
        if (!registry.isActive(c.playerId)) revert PlayerNotActive(c.playerId);

        (, bool met,) = feed.getStat(c.playerId, c.statKey);
        if (!met) revert ThresholdNotMet(c.playerId, c.statKey);

        c.claimed = true;
        address payout = registry.walletOf(c.playerId);
        token.safeTransfer(payout, c.amount);

        emit Claimed(id, c.playerId, payout, c.amount);
    }

    /// @notice Sponsor pulls their money back if the deadline passed without a claim.
    function reclaim(uint256 id) external nonReentrant {
        Commitment storage c = commitments[id];
        if (c.sponsor == address(0)) revert UnknownCommitment(id);
        if (msg.sender != c.sponsor) revert NotSponsor(msg.sender);
        if (c.claimed) revert AlreadyClaimed(id);
        if (c.reclaimed) revert AlreadyReclaimed(id);
        if (block.timestamp < c.deadline) revert DeadlineNotPassed(c.deadline);

        c.reclaimed = true;
        token.safeTransfer(c.sponsor, c.amount);

        emit Reclaimed(id, c.sponsor, c.amount);
    }

    function commitmentsOf(bytes32 playerId) external view returns (uint256[] memory) {
        return _byPlayer[playerId];
    }
}
