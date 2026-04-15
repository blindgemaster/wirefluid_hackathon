# Deploying to WireFluid testnet

Reference for re-deploying the **[Cricket Scholarship DAO](README.md)** contracts from scratch.
Two scripts, one fund step. End-to-end takes < 5 minutes once the deployer is funded.

> 💡 For the hackathon submission, the contracts are **already deployed** — you can skip this file unless you're redeploying. Live addresses are in the [main README](README.md#deployed-contracts).

## Prereqs

- Foundry (`forge`, `cast`) — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- The neighboring [fact/](../fact/) repo checked out at `../fact` (the DON contracts are imported through the `don/` Solidity remapping in `foundry.toml`)
- All tests green: `forge test` → 21/21 passing

## Step 1 — Fund the deployer

A throwaway deployer key has been generated and written to `.env.local` (gitignored):

```
Address:     0x7f233d037705DE321A0aC1512e0bB14b64478ebF
Private key: (see .env.local)
```

Go to **https://faucet.wirefluid.com**, sign in with Google, paste that address, and hit request.

Verify funds landed:

```bash
source .env.local
cast balance 0x7f233d037705DE321A0aC1512e0bB14b64478ebF --rpc-url $WIREFLUID_RPC_URL
```

(Anything > 0 is enough for the demo — deploying ~7 contracts + seeding costs well under 0.1 WIRE at typical WireFluid gas prices.)

> **Replacing the key.** If you want to use your own wallet instead of the generated one, open `.env.local` and overwrite `PRIVATE_KEY`. The address above is derived from that key — change one, change the other.

## Step 2 — `DeployAll`

Deploys everything in one transaction batch: sUSD MockERC20 → DON `PlayerThresholdFeed` → `PlayerRegistry` → `ScholarshipVault` → `ScholarshipDAO` → `DirectSponsorship`, then seeds a demo player and opens a funded scholarship (id=1, 1,000 sUSD, threshold = 50 runs).

```bash
source .env.local
forge script script/DeployAll.s.sol:DeployAll \
  --rpc-url $WIREFLUID_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast --slow
```

The script prints every deployed address at the end. Paste the three highlighted ones into `.env.local`:

```
PLAYER_THRESHOLD_FEED=0x...
SCHOLARSHIP_VAULT=0x...
SCHOLARSHIP_TOKEN=0x...
```

Verify on the explorer: <https://wirefluidscan.com/address/0x7f233d037705DE321A0aC1512e0bB14b64478ebF>

## Step 3 — `Demo`: trigger the payout

Pushes a match-day stat (63 runs — crosses the 50-run threshold) via `PlayerThresholdFeed`, then calls `ScholarshipVault.claim(1)` which pays 1,000 sUSD to the player wallet. Both txs are bundled into one broadcast.

```bash
source .env.local   # pick up the new addresses from Step 2
forge script script/Demo.s.sol:Demo \
  --rpc-url $WIREFLUID_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

The script logs the deployer's sUSD balance before / after, showing the 1,000 sUSD delta. Refresh <https://wirefluidscan.com> — you should see two transactions within ~5 seconds of each other thanks to CometBFT finality.

## Layout that gets produced

```
deployer EOA  ── also acts as aggregator + attestor + DAO member during bootstrap
    │
    ├─► PlayerThresholdFeed   (DON, chain 92533)
    │       └─ threshold: PLAYER_RASHID + RUNS_PER_INNINGS ≥ 50
    │
    ├─► PlayerRegistry
    │       └─ PLAYER_RASHID → deployer wallet (Active, age 17, PAK-KPK)
    │
    ├─► ScholarshipVault      (1,000 sUSD locked for scholarship id=1)
    ├─► ScholarshipDAO        (deployer has weight 100, 10,000 sUSD in treasury)
    └─► DirectSponsorship     (ready for sponsors to commit to any player)
```

## Production hardening (not run by the demo)

The scripts intentionally leave the deployer as admin so the demo is a one-person show. Before any real launch:

1. Add a second DAO member and set a meaningful quorum: `dao.setMemberWeight(...)` + `dao.setParams(3 days, 3000)`.
2. Transfer vault + registry ownership to the DAO: `vault.transferOwnership(address(dao))` + `registry.transferOwnership(address(dao))`.
3. Replace the aggregator address on `PlayerThresholdFeed` with the actual DON `Aggregator` contract (needs multi-signer ECDSA quorum, not a single EOA). That requires `transferAdmin` on the feed and a new deploy of [fact/contracts/src/aggregation/Aggregator.sol](../fact/contracts/src/aggregation/Aggregator.sol) pointing at real node-operator keys.
4. Swap sUSD for a real stablecoin (or wrapped WIRE) once one exists on mainnet.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Deployer has no WIRE` | Faucet hasn't delivered yet — wait 60s and retry `cast balance`. |
| `intrinsic gas too low` | Add `--legacy` to the forge command; some non-EIP1559 paths trip on older chain configs. |
| `nonce too low` | You broadcast twice in parallel. Wait for the first tx to land, or pass `--slow`. |
| Tx stuck pending | WireFluid public RPC rate-limits; try `https://evm2.wirefluid.com`. |
