// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/PlayerRegistry.sol";
import "../src/ScholarshipVault.sol";
import "../src/DirectSponsorship.sol";
import "../src/ScholarshipDAO.sol";
import "../src/interfaces/IERC20.sol";
import "../src/interfaces/IPlayerThresholdFeed.sol";

/// @notice Deploys the Cricket Scholarship DAO stack to WireFluid testnet.
///
/// Env vars (see .env.example):
///   WIREFLUID_RPC_URL      — https://evm.wirefluid.com
///   PRIVATE_KEY            — deployer key (funded from the WireFluid faucet)
///   PLAYER_THRESHOLD_FEED  — address of the DON PlayerThresholdFeed already
///                            deployed on WireFluid from the `fact` repo
///   SCHOLARSHIP_TOKEN      — ERC20 used for payouts (stablecoin or wrapped WIRE)
///
/// Run:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $WIREFLUID_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast --chain 92533
contract Deploy is Script {
    function run() external {
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        address feedAddr = vm.envAddress("PLAYER_THRESHOLD_FEED");
        address tokenAddr = vm.envAddress("SCHOLARSHIP_TOKEN");

        IERC20 token = IERC20(tokenAddr);
        IPlayerThresholdFeed feed = IPlayerThresholdFeed(feedAddr);

        vm.startBroadcast();

        // 1. PlayerRegistry (initial owner = deployer, later transferred to DAO)
        PlayerRegistry registry = new PlayerRegistry(deployer);

        // 2. ScholarshipVault (same owner pattern)
        ScholarshipVault vault = new ScholarshipVault(deployer, token, feed, registry);

        // 3. ScholarshipDAO
        ScholarshipDAO dao = new ScholarshipDAO(deployer, token, vault, registry);

        // 4. DirectSponsorship (no owner — sponsors are their own authority)
        DirectSponsorship sponsorship = new DirectSponsorship(token, feed, registry);

        // 5. Hand registry + vault ownership to the DAO. The deployer remains
        //    the DAO's admin until the bootstrap phase ends.
        registry.transferOwnership(address(dao));
        vault.transferOwnership(address(dao));

        vm.stopBroadcast();

        console2.log("=== Cricket Scholarship DAO deployed on WireFluid (chain 92533) ===");
        console2.log("PlayerRegistry:   ", address(registry));
        console2.log("ScholarshipVault: ", address(vault));
        console2.log("ScholarshipDAO:   ", address(dao));
        console2.log("DirectSponsorship:", address(sponsorship));
        console2.log("Token:            ", tokenAddr);
        console2.log("PlayerThresholdFeed (DON):", feedAddr);
        console2.log("Deployer / DAO admin:     ", deployer);
    }
}
