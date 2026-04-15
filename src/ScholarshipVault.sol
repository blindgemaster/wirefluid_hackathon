// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./common/Ownable.sol";
import "./common/ReentrancyGuard.sol";
import "./common/SafeTransfer.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IPlayerThresholdFeed.sol";
import "./PlayerRegistry.sol";

/// @notice Escrow that releases scholarship tokens when a player crosses
/// performance thresholds verified by the DON PlayerThresholdFeed.
///
/// Flow:
///   1. DAO (or any funder) funds a Scholarship with `createScholarship` or `topUp`.
///      Each scholarship references a (playerId, statKey, threshold) already
///      registered on the DON PlayerThresholdFeed, plus a payout amount.
///   2. DON node operators observe local-tournament data and call
///      PlayerThresholdFeed.pushStat() off-chain on the DON. When the stored
///      value crosses `threshold`, `thresholdMet` becomes true on the feed.
///   3. Anyone calls `claim(scholarshipId)`. The vault re-reads the feed and,
///      if the threshold is met AND the player is Active in the registry,
///      transfers the payout to the player's registered wallet.
///
/// There is no trust in the claimer — the feed and registry are the gate.
contract ScholarshipVault is Ownable, ReentrancyGuard {
    using SafeTransfer for IERC20;

    struct Scholarship {
        bytes32 playerId;
        bytes32 statKey;     // e.g. keccak256("RUNS_PER_INNINGS"), keccak256("WICKETS_TAKEN")
        uint256 threshold;   // snapshot of the on-chain threshold we expect (sanity check)
        uint256 amount;      // payout in `token`
        address funder;
        bool claimed;
        bool cancelled;
        uint256 createdAt;
    }

    IERC20 public immutable token;
    IPlayerThresholdFeed public immutable feed;
    PlayerRegistry public immutable registry;

    uint256 public nextScholarshipId;
    mapping(uint256 => Scholarship) public scholarships;

    error ZeroAmount();
    error UnknownScholarship(uint256 id);
    error AlreadyClaimed(uint256 id);
    error Cancelled(uint256 id);
    error PlayerNotActive(bytes32 playerId);
    error ThresholdMismatch(uint256 expected, uint256 actual);
    error ThresholdNotMet(bytes32 playerId, bytes32 statKey);
    error NotFunderOrOwner(address caller);

    event ScholarshipCreated(
        uint256 indexed id,
        bytes32 indexed playerId,
        bytes32 indexed statKey,
        uint256 threshold,
        uint256 amount,
        address funder
    );
    event ScholarshipToppedUp(uint256 indexed id, uint256 addedAmount, uint256 newAmount);
    event ScholarshipClaimed(
        uint256 indexed id, bytes32 indexed playerId, address indexed payoutWallet, uint256 amount
    );
    event ScholarshipCancelled(uint256 indexed id, uint256 refundedAmount);

    constructor(address initialOwner, IERC20 _token, IPlayerThresholdFeed _feed, PlayerRegistry _registry)
        Ownable(initialOwner)
    {
        token = _token;
        feed = _feed;
        registry = _registry;
    }

    /// @notice Fund a new scholarship. Caller transfers `amount` of `token`.
    /// The (playerId, statKey, threshold) must already be registered on the DON feed.
    function createScholarship(bytes32 playerId, bytes32 statKey, uint256 threshold, uint256 amount)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (amount == 0) revert ZeroAmount();
        (uint256 onchainThreshold, bool exists) = feed.getThreshold(playerId, statKey);
        if (!exists) revert ThresholdMismatch(threshold, 0);
        if (onchainThreshold != threshold) revert ThresholdMismatch(threshold, onchainThreshold);

        id = ++nextScholarshipId;
        scholarships[id] = Scholarship({
            playerId: playerId,
            statKey: statKey,
            threshold: threshold,
            amount: amount,
            funder: msg.sender,
            claimed: false,
            cancelled: false,
            createdAt: block.timestamp
        });

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit ScholarshipCreated(id, playerId, statKey, threshold, amount, msg.sender);
    }

    /// @notice Add more funds to an existing unclaimed scholarship.
    function topUp(uint256 id, uint256 extra) external nonReentrant {
        if (extra == 0) revert ZeroAmount();
        Scholarship storage s = scholarships[id];
        if (s.createdAt == 0) revert UnknownScholarship(id);
        if (s.claimed) revert AlreadyClaimed(id);
        if (s.cancelled) revert Cancelled(id);

        s.amount += extra;
        token.safeTransferFrom(msg.sender, address(this), extra);
        emit ScholarshipToppedUp(id, extra, s.amount);
    }

    /// @notice Anyone can trigger the payout once the feed says the threshold is met.
    function claim(uint256 id) external nonReentrant {
        Scholarship storage s = scholarships[id];
        if (s.createdAt == 0) revert UnknownScholarship(id);
        if (s.claimed) revert AlreadyClaimed(id);
        if (s.cancelled) revert Cancelled(id);

        if (!registry.isActive(s.playerId)) revert PlayerNotActive(s.playerId);

        (, bool met,) = feed.getStat(s.playerId, s.statKey);
        if (!met) revert ThresholdNotMet(s.playerId, s.statKey);

        s.claimed = true;
        address payout = registry.walletOf(s.playerId);
        token.safeTransfer(payout, s.amount);

        emit ScholarshipClaimed(id, s.playerId, payout, s.amount);
    }

    /// @notice Cancel an unclaimed scholarship and return funds to the funder.
    /// Callable by the original funder or the contract owner (DAO).
    function cancel(uint256 id) external nonReentrant {
        Scholarship storage s = scholarships[id];
        if (s.createdAt == 0) revert UnknownScholarship(id);
        if (s.claimed) revert AlreadyClaimed(id);
        if (s.cancelled) revert Cancelled(id);
        if (msg.sender != s.funder && msg.sender != owner) revert NotFunderOrOwner(msg.sender);

        s.cancelled = true;
        uint256 refund = s.amount;
        s.amount = 0;
        token.safeTransfer(s.funder, refund);

        emit ScholarshipCancelled(id, refund);
    }

    function isClaimable(uint256 id) external view returns (bool) {
        Scholarship storage s = scholarships[id];
        if (s.createdAt == 0 || s.claimed || s.cancelled) return false;
        if (!registry.isActive(s.playerId)) return false;
        (, bool met,) = feed.getStat(s.playerId, s.statKey);
        return met;
    }
}
