# Oracle-Powered Grassroots Cricket Scholarship DAO

Submission for the ICC **Next In 2.0** hackathon — *Coaching and Grassroots Participation* track.

> Fund young cricket talent from anywhere. DON oracle nodes attest match stats
> from local tournaments. Hit performance thresholds → scholarship tokens
> release automatically. No committee, no corruption, no delay.

Built on **WireFluid** (Chain ID `92533`, CometBFT-EVM, ~5s finality) and
consumes the [DON (Decentralized Oracle Network)](../fact) sports feeds as the
source of truth for player performance.

## Architecture

```
                Grassroots tournament (village, school, age-group)
                                    │
                                    ▼
                 DON node-operator adapter (fact/services/node-operator)
                                    │  (multi-source consensus)
                                    ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │           DON PlayerThresholdFeed  (fact/contracts/src/sports)     │
 │     pushStat(playerId, statKey, value) → thresholdMet = true       │
 └──────────────────────────┬──────────────────────────────────────────┘
                            │  (this repo consumes it read-only)
                            ▼
        ┌─────────────────────────────────────────────────┐
        │              ScholarshipVault                   │
        │  claim(id) → if feed.thresholdMet → transfer   │
        └───────┬──────────────────────┬──────────────────┘
                │                      │
                ▼                      ▼
       ScholarshipDAO          DirectSponsorship
    (grants via quorum)     (1:1 sponsor → player)
```

## Contracts

| Contract | Purpose |
|---|---|
| [src/PlayerRegistry.sol](src/PlayerRegistry.sol) | Attestor-vouched player profiles linked to payout wallets |
| [src/ScholarshipVault.sol](src/ScholarshipVault.sol) | Oracle-gated escrow — the key release primitive |
| [src/DirectSponsorship.sol](src/DirectSponsorship.sol) | 1:1 sponsor → player commitments with reclaim deadline |
| [src/ScholarshipDAO.sol](src/ScholarshipDAO.sol) | Weighted-vote treasury over the vault + registry |
| [src/interfaces/IPlayerThresholdFeed.sol](src/interfaces/IPlayerThresholdFeed.sol) | Interface mirroring the DON feed this repo consumes |

## How it uses WireFluid

- **~5s finality** means the end-to-end demo (stat pushed → scholarship claimed)
  completes inside one live camera shot — a judge sees funds hit the player
  wallet in the same block-explorer refresh.
- **Standard Solidity 0.8.28 + Foundry** — no chain-specific code.
- **Stable & low gas** on WireFluid keeps micro-grants economically viable.
- **IBC-native token model** (via the Cosmos SDK underpinnings) lets sponsors
  fund scholarships from any IBC-connected chain without a centralised bridge.

## How it plugs into the DON (`fact/` repo)

This repo is *purposefully thin*. The heavy lifting — multi-source consensus,
ball-by-ball cricket schemas, node-operator adapters, BLS aggregation — already
lives in [`fact/`](../fact):

- Source of truth: [`fact/contracts/src/sports/PlayerThresholdFeed.sol`](../fact/contracts/src/sports/PlayerThresholdFeed.sol)
- Off-chain node: [`fact/services/node-operator/src/`](../fact/services/node-operator/src)
- Attestors (for player identity / age): [`fact/contracts/src/attestation/AttestationRegistry.sol`](../fact/contracts/src/attestation/AttestationRegistry.sol)

The `foundry.toml` remapping `don/=../fact/contracts/src/` is how Solidity imports
resolve to the live DON contracts. `forge-std` is also borrowed from `fact/contracts/lib`
so this repo has zero submodules of its own.

## Tests (21/21 passing)

| Suite | Proves |
|---|---|
| `test/ScholarshipVault.t.sol` (9) | Oracle-gated escrow: create, top-up, claim, cancel, suspended-player rejection |
| `test/DirectSponsorship.t.sol` (5) | Sponsor commit/claim/reclaim + deadline semantics |
| `test/ScholarshipDAO.t.sol` (4) | Weighted voting, quorum, proposal lifecycle |
| `test/Integration.t.sol` (3) | **Full journey against the real DON `PlayerThresholdFeed` from the `fact` repo** — no mocks on the oracle side. Demonstrates: attestor approval → DAO fund → sponsor commit → DON aggregator pushes stat → anyone claims → funds land in player wallet in one block. |

The integration suite is the money shot: it imports `don/sports/PlayerThresholdFeed.sol`
through the `foundry.toml` remapping and deploys it as-is alongside our contracts,
so the test is proof that the hackathon submission composes with the underlying
oracle network — not just with a hand-written test double.

## Quickstart

```bash
# 1. Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# 2. Build + test (requires the neighboring `fact` repo checked out at ../fact)
forge build
forge test -vv

# 3. Deploy to WireFluid testnet (chain 92533)
cp .env.example .env   # then fill in PRIVATE_KEY, PLAYER_THRESHOLD_FEED, SCHOLARSHIP_TOKEN
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://evm.wirefluid.com \
  --private-key $PRIVATE_KEY \
  --broadcast --chain 92533
```

## Demo flow (for the judges)

1. Attestor registers player `PLAYER_RASHID_001` in `PlayerRegistry` (U17, PAK-KPK).
2. DAO votes to activate the player + fund a 1,000 sUSD scholarship tied to
   `statKey = keccak256("RUNS_PER_INNINGS")`, threshold = 50.
3. DON node-operator parses the local-tournament scorecard and pushes
   `pushStat(PLAYER_RASHID_001, RUNS_PER_INNINGS, 63)` via the aggregator.
4. On WireFluid, `PlayerThresholdFeed` emits `ThresholdTriggered`.
5. Anyone calls `ScholarshipVault.claim(1)` → 1,000 sUSD lands in the player's
   wallet in the next ~5s block. Explorer link on [wirefluidscan.com](https://wirefluidscan.com).

No committee, no corruption, no delay.
