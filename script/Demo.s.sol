// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";

import "../src/ScholarshipVault.sol";
import "../src/interfaces/IERC20.sol";
import {PlayerThresholdFeed} from "don/sports/PlayerThresholdFeed.sol";

/// @notice End-to-end demo on WireFluid testnet.
///
/// Step 1: deployer (acting as the DON aggregator) pushes a match-day stat
///         that crosses the on-chain threshold. `ThresholdTriggered` fires.
/// Step 2: anyone — we use the deployer here — calls vault.claim(1). Funds
///         land in the player's wallet in the next block (~5s on WireFluid).
///
/// Env vars (set after DeployAll.s.sol):
///   PRIVATE_KEY            — same deployer key used for DeployAll
///   PLAYER_THRESHOLD_FEED  — address printed by DeployAll
///   SCHOLARSHIP_VAULT      — address printed by DeployAll
///   SCHOLARSHIP_TOKEN      — the sUSD MockERC20 printed by DeployAll
///
/// Run:
///   forge script script/Demo.s.sol:Demo \
///     --rpc-url https://evm.wirefluid.com \
///     --private-key $PRIVATE_KEY \
///     --broadcast
contract Demo is Script {
    bytes32 constant PLAYER_ID = keccak256("PAK-KPK-U17-RASHID-001");
    bytes32 constant RUNS_KEY = keccak256("RUNS_PER_INNINGS");
    uint256 constant DEMO_RUNS = 63; // > threshold of 50

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        PlayerThresholdFeed feed = PlayerThresholdFeed(vm.envAddress("PLAYER_THRESHOLD_FEED"));
        ScholarshipVault vault = ScholarshipVault(vm.envAddress("SCHOLARSHIP_VAULT"));
        IERC20 token = IERC20(vm.envAddress("SCHOLARSHIP_TOKEN"));

        uint256 playerBalBefore = token.balanceOf(deployer);
        console2.log("Player wallet:", deployer);
        console2.log("sUSD balance BEFORE payout:", playerBalBefore);

        vm.startBroadcast(pk);

        // Step 1: DON aggregator reports the match-day stat
        feed.pushStat(PLAYER_ID, RUNS_KEY, DEMO_RUNS);
        console2.log("Pushed stat via PlayerThresholdFeed: RUNS_PER_INNINGS =", DEMO_RUNS);

        // Step 2: trigger the scholarship payout
        require(vault.isClaimable(1), "scholarship id 1 not claimable");
        vault.claim(1);

        vm.stopBroadcast();

        uint256 playerBalAfter = token.balanceOf(deployer);
        console2.log("sUSD balance AFTER payout:", playerBalAfter);
        console2.log("Delta:", playerBalAfter - playerBalBefore);
        console2.log(unicode"Block explorer: https://wirefluidscan.com/address/", deployer);
    }
}
