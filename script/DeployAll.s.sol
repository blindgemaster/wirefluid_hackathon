// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";

// Full hackathon stack
import "../src/PlayerRegistry.sol";
import "../src/ScholarshipVault.sol";
import "../src/DirectSponsorship.sol";
import "../src/ScholarshipDAO.sol";
import "../src/mocks/MockERC20.sol";
import "../src/interfaces/IERC20.sol";
import "../src/interfaces/IPlayerThresholdFeed.sol";

// Real DON contract from the neighbor fact/ repo (resolved via `don/` remapping)
import {PlayerThresholdFeed} from "don/sports/PlayerThresholdFeed.sol";

/// @notice One-shot deployment to WireFluid testnet (chain 92533).
///
/// Deploys:
///   1. MockERC20 "ScholarshipUSD" (sUSD) as the demo payout token
///   2. DON PlayerThresholdFeed with the deployer acting as aggregator
///      (in production this is the real DON Aggregator contract)
///   3. PlayerRegistry, ScholarshipVault, DirectSponsorship, ScholarshipDAO
///   4. Seeds a demo player + threshold + a funded scholarship so the
///      Demo.s.sol script can trigger a claim in one tx.
///
/// Deployer is also the attestor and the sole DAO member during bootstrap.
/// Ownership is NOT transferred to the DAO here — the demo script needs the
/// deployer to retain direct access. For a production deploy, add
/// `registry.transferOwnership(address(dao))` + `vault.transferOwnership(...)`
/// after the seed phase.
///
/// Run:
///   forge script script/DeployAll.s.sol:DeployAll \
///     --rpc-url https://evm.wirefluid.com \
///     --private-key $PRIVATE_KEY \
///     --broadcast --slow
contract DeployAll is Script {
    // Demo data — keep in sync with Demo.s.sol
    bytes32 constant PLAYER_ID = keccak256("PAK-KPK-U17-RASHID-001");
    bytes32 constant RUNS_KEY = keccak256("RUNS_PER_INNINGS");
    bytes32 constant FEED_ID = keccak256("DON-CRICKET-PLAYER-THRESHOLDS");
    bytes32 constant SCHEMA_ID = keccak256("PlayerStatThreshold:v1");
    uint256 constant THRESHOLD_RUNS = 50;
    uint256 constant SCHOLARSHIP_AMOUNT = 1_000 ether; // 1000 sUSD

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console2.log("Deployer:", deployer);
        console2.log("Deployer balance (wei):", deployer.balance);
        require(deployer.balance > 0, "Deployer has no WIRE. Fund via https://faucet.wirefluid.com");

        vm.startBroadcast(pk);

        // ----- 1. Demo payout token ------------------------------------------
        MockERC20 token = new MockERC20("ScholarshipUSD", "sUSD", 18);
        token.mint(deployer, 1_000_000 ether);

        // ----- 2. Real DON PlayerThresholdFeed --------------------------------
        // In production the `aggregator` arg is the DON Aggregator contract
        // address. For the demo we pass the deployer EOA — that's the only
        // address that can call pushStat(), which keeps the live demo simple.
        PlayerThresholdFeed feed = new PlayerThresholdFeed(
            deployer, FEED_ID, SCHEMA_ID, deployer, "WireFluid grassroots cricket thresholds"
        );
        feed.registerThreshold(PLAYER_ID, RUNS_KEY, THRESHOLD_RUNS);

        // ----- 3. Hackathon stack ---------------------------------------------
        PlayerRegistry registry = new PlayerRegistry(deployer);
        ScholarshipVault vault = new ScholarshipVault(
            deployer, IERC20(address(token)), IPlayerThresholdFeed(address(feed)), registry
        );
        ScholarshipDAO dao = new ScholarshipDAO(
            deployer, IERC20(address(token)), vault, registry
        );
        DirectSponsorship sponsorship = new DirectSponsorship(
            IERC20(address(token)), IPlayerThresholdFeed(address(feed)), registry
        );

        // ----- 4. Seed demo data ---------------------------------------------
        // Deployer self-authorises as attestor, registers + activates the demo
        // player, funds the vault, and opens scholarship id=1.
        registry.setAttestor(deployer, true);
        registry.register(PLAYER_ID, deployer, 17, "PAK-KPK");
        registry.activate(PLAYER_ID);

        token.approve(address(vault), SCHOLARSHIP_AMOUNT);
        uint256 id = vault.createScholarship(PLAYER_ID, RUNS_KEY, THRESHOLD_RUNS, SCHOLARSHIP_AMOUNT);
        require(id == 1, "expected first scholarship to have id=1");

        // Seed DAO: deployer as sole member with 100 weight + treasury
        dao.setMemberWeight(deployer, 100);
        token.transfer(address(dao), 10_000 ether);

        vm.stopBroadcast();

        // ----- 5. Log everything ---------------------------------------------
        console2.log("=== WireFluid deployment complete (chain 92533) ===");
        console2.log("sUSD (MockERC20):    ", address(token));
        console2.log("PlayerThresholdFeed: ", address(feed));
        console2.log("PlayerRegistry:      ", address(registry));
        console2.log("ScholarshipVault:    ", address(vault));
        console2.log("ScholarshipDAO:      ", address(dao));
        console2.log("DirectSponsorship:   ", address(sponsorship));
        console2.log("---");
        console2.log("Demo player (recipient wallet = deployer):", deployer);
        console2.log("Seeded scholarship id:", id);
        console2.log("  playerId :", vm.toString(PLAYER_ID));
        console2.log("  statKey  : RUNS_PER_INNINGS");
        console2.log("  threshold:", THRESHOLD_RUNS);
        console2.log("  amount   : 1000 sUSD");
        console2.log("---");
        console2.log("Next: paste these addresses into .env and run:");
        console2.log("  forge script script/Demo.s.sol:Demo --rpc-url $WIREFLUID_RPC_URL \\");
        console2.log("    --private-key $PRIVATE_KEY --broadcast");
    }
}
