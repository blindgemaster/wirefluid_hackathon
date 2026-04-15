// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./common/Ownable.sol";
import "./common/ReentrancyGuard.sol";
import "./common/SafeTransfer.sol";
import "./interfaces/IERC20.sol";
import "./ScholarshipVault.sol";
import "./PlayerRegistry.sol";

/// @notice Minimal governance over the ScholarshipVault treasury.
///
/// Members hold a non-transferable governance token allocation granted by the
/// bootstrap admin (e.g. founding coaches, alumni, regional federations).
/// Any member can submit proposals; proposals need a quorum of YES weight to
/// execute. Supported proposal actions are intentionally narrow:
///   - FundScholarship(playerId, statKey, threshold, amount)
///       Moves `amount` of treasury token from DAO → ScholarshipVault and
///       opens a new oracle-gated scholarship.
///   - SetAttestor(attestor, allowed)
///       Adds/removes an address allowed to vouch for players in PlayerRegistry.
///   - ActivatePlayer(playerId) / SuspendPlayer(playerId, reason)
///       Registry lifecycle transitions.
///
/// This is intentionally *not* OpenZeppelin Governor — hackathon repo stays
/// dependency-free and the DAO surface fits on one page. The vault is still
/// `Ownable` with this contract as owner, so upgrading governance later just
/// means calling `transferOwnership` on the vault + registry.
contract ScholarshipDAO is Ownable, ReentrancyGuard {
    using SafeTransfer for IERC20;

    enum ActionKind {
        FundScholarship,
        SetAttestor,
        ActivatePlayer,
        SuspendPlayer
    }

    struct Proposal {
        ActionKind kind;
        bytes payload;           // abi-encoded args specific to `kind`
        address proposer;
        uint64 createdAt;
        uint64 votingEnds;
        uint256 yesWeight;
        uint256 noWeight;
        bool executed;
        bool cancelled;
        string description;
    }

    IERC20 public immutable token;            // scholarship treasury token
    ScholarshipVault public immutable vault;
    PlayerRegistry public immutable registry;

    // Governance: non-transferable member weights
    mapping(address => uint256) public weightOf;
    uint256 public totalWeight;

    uint64 public votingPeriod = 3 days;
    uint256 public quorumBps = 2000; // 20% of totalWeight required YES for execution

    Proposal[] private _proposals;
    // proposalId => voter => hasVoted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    error NotMember(address caller);
    error AlreadyVoted(uint256 proposalId);
    error VotingClosed(uint256 proposalId);
    error VotingOpen(uint256 proposalId);
    error ProposalMissing(uint256 proposalId);
    error AlreadyExecuted(uint256 proposalId);
    error Cancelled(uint256 proposalId);
    error QuorumFailed(uint256 yesWeight, uint256 required);
    error MajorityFailed(uint256 yesWeight, uint256 noWeight);
    error BadQuorum(uint256 quorumBps);
    error BadVotingPeriod(uint64 period);
    error ExecFailed(ActionKind kind);

    event MemberWeightSet(address indexed member, uint256 weight, uint256 totalWeight);
    event ProposalCreated(uint256 indexed id, address indexed proposer, ActionKind kind, string description);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id);
    event ProposalCancelled(uint256 indexed id);
    event ParamsUpdated(uint64 votingPeriod, uint256 quorumBps);

    constructor(
        address initialOwner,
        IERC20 _token,
        ScholarshipVault _vault,
        PlayerRegistry _registry
    ) Ownable(initialOwner) {
        token = _token;
        vault = _vault;
        registry = _registry;
    }

    // --- Bootstrap / admin ---

    /// @notice Set a member's voting weight. Owner-only during bootstrap; in a
    /// later phase the DAO can transfer ownership to itself to self-govern.
    function setMemberWeight(address member, uint256 weight) external onlyOwner {
        uint256 old = weightOf[member];
        weightOf[member] = weight;
        totalWeight = totalWeight - old + weight;
        emit MemberWeightSet(member, weight, totalWeight);
    }

    function setParams(uint64 _votingPeriod, uint256 _quorumBps) external onlyOwner {
        if (_quorumBps == 0 || _quorumBps > 10_000) revert BadQuorum(_quorumBps);
        if (_votingPeriod < 1 hours || _votingPeriod > 30 days) revert BadVotingPeriod(_votingPeriod);
        votingPeriod = _votingPeriod;
        quorumBps = _quorumBps;
        emit ParamsUpdated(_votingPeriod, _quorumBps);
    }

    // --- Proposals ---

    function proposeFundScholarship(
        bytes32 playerId,
        bytes32 statKey,
        uint256 threshold,
        uint256 amount,
        string calldata description
    ) external returns (uint256 id) {
        return _propose(
            ActionKind.FundScholarship,
            abi.encode(playerId, statKey, threshold, amount),
            description
        );
    }

    function proposeSetAttestor(address attestor, bool allowed, string calldata description)
        external
        returns (uint256 id)
    {
        return _propose(ActionKind.SetAttestor, abi.encode(attestor, allowed), description);
    }

    function proposeActivatePlayer(bytes32 playerId, string calldata description) external returns (uint256 id) {
        return _propose(ActionKind.ActivatePlayer, abi.encode(playerId), description);
    }

    function proposeSuspendPlayer(bytes32 playerId, string calldata reason, string calldata description)
        external
        returns (uint256 id)
    {
        return _propose(ActionKind.SuspendPlayer, abi.encode(playerId, reason), description);
    }

    function _propose(ActionKind kind, bytes memory payload, string calldata description)
        internal
        returns (uint256 id)
    {
        if (weightOf[msg.sender] == 0) revert NotMember(msg.sender);

        id = _proposals.length;
        _proposals.push(
            Proposal({
                kind: kind,
                payload: payload,
                proposer: msg.sender,
                createdAt: uint64(block.timestamp),
                votingEnds: uint64(block.timestamp) + votingPeriod,
                yesWeight: 0,
                noWeight: 0,
                executed: false,
                cancelled: false,
                description: description
            })
        );
        emit ProposalCreated(id, msg.sender, kind, description);
    }

    function vote(uint256 id, bool support) external {
        if (id >= _proposals.length) revert ProposalMissing(id);
        Proposal storage p = _proposals[id];
        if (p.cancelled) revert Cancelled(id);
        if (block.timestamp >= p.votingEnds) revert VotingClosed(id);
        if (hasVoted[id][msg.sender]) revert AlreadyVoted(id);

        uint256 w = weightOf[msg.sender];
        if (w == 0) revert NotMember(msg.sender);

        hasVoted[id][msg.sender] = true;
        if (support) p.yesWeight += w;
        else p.noWeight += w;

        emit Voted(id, msg.sender, support, w);
    }

    /// @notice Anyone can execute a proposal once voting is closed and it passed.
    function execute(uint256 id) external nonReentrant {
        if (id >= _proposals.length) revert ProposalMissing(id);
        Proposal storage p = _proposals[id];
        if (p.cancelled) revert Cancelled(id);
        if (p.executed) revert AlreadyExecuted(id);
        if (block.timestamp < p.votingEnds) revert VotingOpen(id);

        uint256 required = (totalWeight * quorumBps) / 10_000;
        if (p.yesWeight < required) revert QuorumFailed(p.yesWeight, required);
        if (p.yesWeight <= p.noWeight) revert MajorityFailed(p.yesWeight, p.noWeight);

        p.executed = true;
        _dispatch(p.kind, p.payload);
        emit ProposalExecuted(id);
    }

    /// @notice Proposer or owner can cancel before voting ends.
    function cancel(uint256 id) external {
        if (id >= _proposals.length) revert ProposalMissing(id);
        Proposal storage p = _proposals[id];
        if (p.executed) revert AlreadyExecuted(id);
        if (msg.sender != p.proposer && msg.sender != owner) revert NotMember(msg.sender);
        p.cancelled = true;
        emit ProposalCancelled(id);
    }

    function _dispatch(ActionKind kind, bytes memory payload) internal {
        if (kind == ActionKind.FundScholarship) {
            (bytes32 playerId, bytes32 statKey, uint256 threshold, uint256 amount) =
                abi.decode(payload, (bytes32, bytes32, uint256, uint256));
            // Approve + create in the vault. The DAO holds the treasury; the vault
            // pulls `amount` via transferFrom inside createScholarship.
            token.approve(address(vault), amount);
            vault.createScholarship(playerId, statKey, threshold, amount);
        } else if (kind == ActionKind.SetAttestor) {
            (address attestor, bool allowed) = abi.decode(payload, (address, bool));
            registry.setAttestor(attestor, allowed);
        } else if (kind == ActionKind.ActivatePlayer) {
            bytes32 playerId = abi.decode(payload, (bytes32));
            registry.activate(playerId);
        } else if (kind == ActionKind.SuspendPlayer) {
            (bytes32 playerId, string memory reason) = abi.decode(payload, (bytes32, string));
            registry.suspend(playerId, reason);
        } else {
            revert ExecFailed(kind);
        }
    }

    // --- Views ---

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(uint256 id) external view returns (Proposal memory) {
        if (id >= _proposals.length) revert ProposalMissing(id);
        return _proposals[id];
    }

    /// @notice Accept treasury deposits (sponsors / grants). Caller must pre-approve.
    function deposit(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
    }
}
