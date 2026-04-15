// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./common/Ownable.sol";

/// @notice On-chain registry linking a canonical `playerId` (as used by the DON
/// PlayerThresholdFeed) to the player's payout wallet plus coarse profile metadata.
/// An attestor (Tier-2+ in the DON AttestationRegistry sense) must vouch for the
/// player before they become `Active` and scholarship funds can be claimed.
contract PlayerRegistry is Ownable {
    enum Status {
        None,
        Pending,
        Active,
        Suspended
    }

    struct Player {
        bytes32 playerId; // same id used in DON feeds
        address wallet;   // where scholarship payouts land
        address attestor; // who vouched for identity + age
        uint16 age;       // at time of registration
        string region;    // e.g. "PAK-KPK", "IND-MUM", "BGD-DHK"
        Status status;
        uint256 registeredAt;
    }

    error ZeroPlayerId();
    error ZeroWallet();
    error PlayerExists(bytes32 playerId);
    error PlayerMissing(bytes32 playerId);
    error NotAttestor(address caller);
    error InvalidAge(uint16 age);

    mapping(bytes32 => Player) private _players;
    mapping(address => bool) public isAttestor;

    event AttestorSet(address indexed attestor, bool allowed);
    event PlayerRegistered(bytes32 indexed playerId, address indexed wallet, address indexed attestor);
    event PlayerActivated(bytes32 indexed playerId);
    event PlayerSuspended(bytes32 indexed playerId, string reason);
    event WalletUpdated(bytes32 indexed playerId, address indexed oldWallet, address indexed newWallet);

    constructor(address initialOwner) Ownable(initialOwner) {}

    // --- Attestor management (owner-only; in prod this is the ScholarshipDAO) ---

    function setAttestor(address attestor, bool allowed) external onlyOwner {
        isAttestor[attestor] = allowed;
        emit AttestorSet(attestor, allowed);
    }

    // --- Player lifecycle ---

    /// @notice Attestor registers a player. Starts in Pending; owner/DAO must activate.
    function register(bytes32 playerId, address wallet, uint16 age, string calldata region) external {
        if (!isAttestor[msg.sender]) revert NotAttestor(msg.sender);
        if (playerId == bytes32(0)) revert ZeroPlayerId();
        if (wallet == address(0)) revert ZeroWallet();
        if (age == 0 || age > 25) revert InvalidAge(age); // grassroots scholarship age cap
        if (_players[playerId].status != Status.None) revert PlayerExists(playerId);

        _players[playerId] = Player({
            playerId: playerId,
            wallet: wallet,
            attestor: msg.sender,
            age: age,
            region: region,
            status: Status.Pending,
            registeredAt: block.timestamp
        });

        emit PlayerRegistered(playerId, wallet, msg.sender);
    }

    function activate(bytes32 playerId) external onlyOwner {
        Player storage p = _players[playerId];
        if (p.status == Status.None) revert PlayerMissing(playerId);
        p.status = Status.Active;
        emit PlayerActivated(playerId);
    }

    function suspend(bytes32 playerId, string calldata reason) external onlyOwner {
        Player storage p = _players[playerId];
        if (p.status == Status.None) revert PlayerMissing(playerId);
        p.status = Status.Suspended;
        emit PlayerSuspended(playerId, reason);
    }

    /// @notice The player (or their attestor) updates the payout wallet.
    function updateWallet(bytes32 playerId, address newWallet) external {
        if (newWallet == address(0)) revert ZeroWallet();
        Player storage p = _players[playerId];
        if (p.status == Status.None) revert PlayerMissing(playerId);
        if (msg.sender != p.wallet && msg.sender != p.attestor && msg.sender != owner) {
            revert NotAttestor(msg.sender);
        }
        address old = p.wallet;
        p.wallet = newWallet;
        emit WalletUpdated(playerId, old, newWallet);
    }

    // --- Views ---

    function getPlayer(bytes32 playerId) external view returns (Player memory) {
        return _players[playerId];
    }

    function walletOf(bytes32 playerId) external view returns (address) {
        return _players[playerId].wallet;
    }

    function isActive(bytes32 playerId) external view returns (bool) {
        return _players[playerId].status == Status.Active;
    }
}
