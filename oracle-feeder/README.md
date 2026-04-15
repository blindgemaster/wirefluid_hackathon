# Oracle Feeder

Pushes live (or simulated) cricket stats into the WireFluid `PlayerThresholdFeed`
that the Cricket Scholarship DAO reads from. This is the off-chain half of the
oracle pipeline — in production these calls would come from a DON node-operator
whose signature is aggregated via `Aggregator.sol`, but for the hackathon we
sign directly with the deployer key so the flow fits on one page.

## Two modes

| Mode | What it does | When to use |
|---|---|---|
| `simulated` (default) | Plays back a scripted 80-second T20 innings. Deterministic. Threshold (50 runs) is crossed at ~T=58s. | Recording the Loom — predictable timing, no external deps. |
| `cricapi` | Polls `api.cricapi.com/v1/match_scorecard` every `POLL_INTERVAL_SEC` for a real match and pushes per-player stat deltas. | Showing judges that the oracle reads actual match data. |

Both modes call the same `pushStat(playerId, statKey, value)` — the UI can't
tell them apart.

## Install

```bash
cd oracle-feeder
npm install
cp .env.example .env
# edit .env — set PRIVATE_KEY + whichever mode you want
```

## Run — simulated mode

No external setup needed. Simulated is the default mode if `FEED_MODE` isn't set.

```bash
npm start
```

You'll see something like:

```
🏏 Simulated match starting — Rashid at the crease
   Feed: 0x1B0F274DE9f1A59f547bfC0350821d0079251efD
   Signer: 0x7f233d037705DE321A0aC1512e0bB14b64478ebF
────────────────────────────────────────

  🎙️  walks to the crease
[22:04:03] PAK-KPK-U17-RASHID-001       RUNS_PER_INNINGS       →   0 tx 0xa1b2c3… ⏳
                                                                   ✓ confirmed in block 913145

  🎙️  drives through covers for FOUR
[22:04:10] PAK-KPK-U17-RASHID-001       RUNS_PER_INNINGS       →   4 tx 0xd4e5f6… ⏳
                                                                   ✓ confirmed in block 913147
...
```

Open the portal at http://127.0.0.1:5175/scholarship while this runs — the
progress bar ticks up with every tx, and the pill flips to **Ready to claim**
when the feed value crosses 50.

## Run — CricAPI mode

You need a free CricAPI key. Sign up at https://cricapi.com/ (100 req/day
free tier is plenty at a 30s poll).

```bash
# 1. Find a live match
curl "https://api.cricapi.com/v1/currentMatches?apikey=$CRICAPI_KEY&offset=0" | jq

# 2. Pick a match id + the batsman whose stats you care about
#    Example: "dff93e0a-8128-4f3b-88b0-9a6b8a0e6b8b", player "c7d9e0…"

# 3. Edit .env
#    FEED_MODE=cricapi
#    CRICAPI_KEY=pk_abc123…
#    CRICAPI_MATCH_ID=dff93e0a-8128-4f3b-88b0-9a6b8a0e6b8b
#    CRICAPI_PLAYER_MAP=c7d9e0…:PAK-KPK-U17-RASHID-001

# 4. Run
npm start
```

The feeder polls the scorecard endpoint, extracts runs / wickets / fours / sixes
for each mapped player, and pushes deltas on-chain. Dedup prevents redundant
transactions when the score hasn't moved.

## Player ID mapping

The canonical `playerId` on-chain is `keccak256(utf8 label)`. The label must
match what's registered in the `PlayerRegistry`. The seeded player is:

- Label: `PAK-KPK-U17-RASHID-001`
- On-chain playerId: `0x1e62d15318c63390b4f36b7c8747c2d9da27b03141b911782877734d8c0d1276`

To track a new CricAPI player, register them via `PlayerRegistry.register()`
with whatever label you like, then add `<cricapi-id>:<label>` to
`CRICAPI_PLAYER_MAP`.

## Replay / reset

```bash
# wipe the feed's current value back to 0 so you can re-run the simulated match
cast send $PLAYER_THRESHOLD_FEED "pushStat(bytes32,bytes32,uint256)" \
  0x1e62d15318c63390b4f36b7c8747c2d9da27b03141b911782877734d8c0d1276 \
  0x153b00ad70d7c3a8dfc9defe34d41ebc7c4aec9be7c6a10f8865ce57a41ed35c \
  0 \
  --rpc-url $WIREFLUID_RPC_URL --private-key $PRIVATE_KEY
```

Or just use the orange **Reset stat → 0** button on the portal's `/scholarship`
page — same thing, one click.

## Cost

WireFluid testnet gas is ~20 gwei. Each `pushStat` is ~55k gas = ~0.001 WIRE.
The simulated match fires 10 txs so the full run costs <0.02 WIRE. The CricAPI
poller with dedup costs ~0 when no stats change, spiking to ~0.001 per delta.
