# Oracle Feeder

Off-chain script that pushes cricket stats into the WireFluid `PlayerThresholdFeed`
that the **[Cricket Scholarship DAO](../README.md)** reads from.

In production this would be a DON node-operator whose signature is aggregated via
`Aggregator.sol` across multiple independent nodes. For the hackathon we sign
directly with the deployer key so the full flow fits on one page and plays out on
camera in ~80 seconds.

## Two modes

| Mode | What it does | When to use |
|---|---|---|
| `simulated` (default) | Plays back a scripted 80-second T20 innings. Deterministic. Threshold (50 runs) crosses at ~T=58s. | Recording the Loom — predictable timing, no external deps, no rate limits. |
| `cricapi` | Polls `api.cricapi.com/v1/match_scorecard` every `POLL_INTERVAL_SEC` and pushes per-player stat deltas. Verified live against an in-play IPL 2026 match — the same code path handles any cricket fixture CricAPI covers (PSL, BBL, county, under-19 circuits). | Showing judges that the oracle reads real match data. |

Both modes produce the same on-chain effect — the dapp UI can't tell them apart.

---

## Install

```bash
cd oracle-feeder
npm install
cp .env.example .env
# edit .env — set PRIVATE_KEY and pick your mode
```

## Simulated mode

No external setup needed. `simulated` is the default if `FEED_MODE` is unset.

```bash
npm start
```

You'll see:

```
🏏 Simulated match starting — Rashid at the crease
   Feed: 0x1B0F274DE9f1A59f547bfC0350821d0079251efD
   Signer: 0x7f23…8ebF
────────────────────────────────────────

  🎙️  walks to the crease
[22:04:03] PAK-KPK-U17-RASHID-001  RUNS_PER_INNINGS  →  0  tx 0xa1b2… ⏳
                                                       ✓ confirmed in block 913145

  🎙️  drives through covers for FOUR
[22:04:10] PAK-KPK-U17-RASHID-001  RUNS_PER_INNINGS  →  4  tx 0xd4e5… ⏳
                                                       ✓ confirmed in block 913147
…
```

Open the portal at `/scholarship` (locally or on Vercel) while this runs — the progress bar ticks up with every tx, and the pill flips to **Ready to claim** when the feed value crosses 50. Click **Claim** → payout.

## CricAPI live mode

Point at a real match — PSL finals, an under-19 fixture, anything CricAPI covers.

```bash
# 1. Get a free CricAPI key (100 req/day tier is plenty at a 30s poll)
#    https://cricapi.com/

# 2. List current matches and pick one that's in progress
curl "https://api.cricapi.com/v1/currentMatches?apikey=$CRICAPI_KEY&offset=0" | jq

# 3. For PSL 2026 matches the id/name/status come straight from the API, e.g.
#      { "id": "abc123…", "name": "Karachi Kings vs Lahore Qalandars, PSL 2026 Match 12",
#        "status": "Karachi Kings need 47 runs in 30 balls" }

# 4. Decide whose stats to push on-chain. Find their CricAPI player id from the
#    match_scorecard endpoint:
curl "https://api.cricapi.com/v1/match_scorecard?apikey=$CRICAPI_KEY&id=<MATCH_ID>" | jq

# 5. Edit oracle-feeder/.env:
#      FEED_MODE=cricapi
#      CRICAPI_KEY=pk_abc123…
#      CRICAPI_MATCH_ID=<match id>
#      CRICAPI_PLAYER_MAP=<cricapi player id>:<on-chain label registered in PlayerRegistry>

# 6. Run
npm start
```

The feeder polls the scorecard endpoint, extracts runs / wickets / fours / sixes for each mapped player, and pushes deltas on-chain. A dedup cache prevents redundant transactions when the score hasn't moved, so gas costs scale with the number of real stat changes — not the poll rate.

---

## Player ID mapping

The canonical `playerId` on-chain is `keccak256(utf8 label)`. The label must match what's registered in `PlayerRegistry.register()`. Our seed player:

- Label: `PAK-KPK-U17-RASHID-001`
- On-chain playerId: `0x1e62d15318c63390b4f36b7c8747c2d9da27b03141b911782877734d8c0d1276`

Registering a new player (see [../dapp](../dapp) → `/register` page) takes a label and automatically sets up the default milestones. Add an entry to `CRICAPI_PLAYER_MAP` in the form `<cricapi_id>:<label>` and that player's runs will stream on-chain.

Multiple players are supported — comma-separate pairs in the map:

```
CRICAPI_PLAYER_MAP=abc-123:PAK-KPK-U17-RASHID-001,def-456:PAK-PUN-U19-KHAN-007
```

---

## Replay / reset (between Loom takes)

```bash
# wipe the feed's current value back to 0 so you can re-run the simulated match
cast send $PLAYER_THRESHOLD_FEED "pushStat(bytes32,bytes32,uint256)" \
  0x1e62d15318c63390b4f36b7c8747c2d9da27b03141b911782877734d8c0d1276 \
  0x153b00ad70d7c3a8dfc9defe34d41ebc7c4aec9be7c6a10f8865ce57a41ed35c \
  0 \
  --rpc-url $WIREFLUID_RPC_URL --private-key $PRIVATE_KEY
```

Or use the orange **Reset & open new** button on the portal's `/scholarship` page — same thing, one click, opens a fresh scholarship at the same time.

---

## Cost

WireFluid testnet gas is ~20 gwei. Each `pushStat` is ~55k gas = ~0.001 WIRE.

- Full simulated match: 10 txs ≈ **0.02 WIRE** (~$0.02 at hypothetical mainnet prices).
- CricAPI poller with dedup: **~0 when scores are static**, spiking to ~0.001 per actual stat change. A full PSL innings with 50+ boundary/wicket events ≈ 0.05 WIRE.

---

## Related

- [../dapp/](../dapp/) — browser UI that reads the feed this script writes to
- [../src/ScholarshipVault.sol](../src/ScholarshipVault.sol) — the on-chain escrow gated on this feed's `thresholdMet`
- [../../fact/services/node-operator/src/adapters/grassroots-cricket.ts](../../fact/services/node-operator/src/adapters/grassroots-cricket.ts) — the canonical DON adapter for multi-source signed scorecards (what this script would graduate into for a production deploy)
