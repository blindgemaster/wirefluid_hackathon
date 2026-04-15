# 🏏 Cricket Scholarship DAO

> **Oracle-gated scholarships for grassroots Pakistani cricketers.**
> No committee. No corruption. No delay.

Submission for the **ICC Next In 2.0** hackathon — *Coaching and Grassroots Participation* track.
Live on **WireFluid** testnet (Chain ID `92533`, CometBFT-EVM, ~5s finality).

---

## The problem

A 16-year-old in rural Khyber Pakhtunkhwa bowls 10 overs a day. A school team in Sindh trains on a concrete strip with a tape ball. A girls' academy in Multan runs on a single coach's salary.

The talent pipeline into the **Pakistan Super League** is real and well-funded at the top — but **the bottom** is broken by three things:

1. **Verification.** No PSL scout flies to a district qualifier in Bannu. If a kid scores a century at an under-19 tournament nobody televises, no cheque follows.
2. **Gatekeeping.** Selection committees are slow, geographically concentrated, and opaque. Tournament organisers in Quetta don't have a direct line to sponsors in Karachi.
3. **Delay.** Even when a scholarship is awarded, paperwork and bank rails turn a match-winning performance into a three-month wait.

Every month this gap costs the PSL a player it should have had.

## The solution

A **DAO** that releases scholarship funds **automatically** when a player hits verifiable performance milestones — verified by a **Decentralized Oracle Network** reading match scorecards, not by a committee.

- Talent surfaces from any tournament — district U17, school leagues, PSL feeder circuits.
- The player's payout wallet is bonded to an attestor (a regional PCB coordinator, a school principal, an ex-PSL player) with economic stake.
- When the player crosses a milestone — *fifty in an innings*, *five-wicket haul*, *century at U19 level* — the oracle reports it, the vault releases, funds land in ~5 seconds.

No selection meeting. No forms. No waiting.

---

## 🎯 Try it live

| | Link |
|---|---|
| 🌐 **Live dapp** | https://wirefluid-hackathon.vercel.app |
| 🔗 **Block explorer** | [wirefluidscan.com](https://wirefluidscan.com) |
| 💧 **Testnet faucet** | [faucet.wirefluid.com](https://faucet.wirefluid.com) |
| 📼 **Demo Loom** | *(link in submission)* |

### Pages you can click

| Route | What it does |
|---|---|
| [`/`](https://wirefluid-hackathon.vercel.app) | Scholarship DAO main demo — push a match stat, trigger the payout |
| [`/sponsor`](https://wirefluid-hackathon.vercel.app/sponsor) | Browse registered players, pledge a direct sponsorship against a milestone |
| [`/register`](https://wirefluid-hackathon.vercel.app/register) | Add a new grassroots player — **gasless**, signed by the trusted attestor relay |

### Demo transactions you can verify on-chain

| Event | Tx |
|---|---|
| DON oracle reports 63 runs | [`0x1be8e4…a8b231c`](https://wirefluidscan.com/tx/0x1be8e4112bb2e6673a2d76fa51606f2d7392a195353521c739e9d2a7aa8b231c) |
| Scholarship claimed — **1,000 sUSD payout** | [`0x8fcdab…c7f6580d`](https://wirefluidscan.com/tx/0x8fcdab82888ee057ad7373d0b1531e92c888b0946897e42f2789d226c7f6580d) |

---

## Deployed contracts

All on WireFluid testnet (chain `92533`):

| Contract | Address |
|---|---|
| [PlayerRegistry](src/PlayerRegistry.sol) — attestor-vouched player profiles | [`0xEE8F…1630F`](https://wirefluidscan.com/address/0xEE8Fa28D81AF46C3b382BB5bdE7655b3dBd1630F) |
| [ScholarshipVault](src/ScholarshipVault.sol) — oracle-gated escrow, the core primitive | [`0x731b…302FB`](https://wirefluidscan.com/address/0x731b5b8CeA87f5AD736C0c4b24Da2a66Fb0302FB) |
| [DirectSponsorship](src/DirectSponsorship.sol) — 1:1 sponsor → player commits | [`0x5783…02196`](https://wirefluidscan.com/address/0x57833Df6d336C512450f655F892054Be36D02196) |
| [ScholarshipDAO](src/ScholarshipDAO.sol) — weighted-vote treasury | [`0xcaF5…98703`](https://wirefluidscan.com/address/0xcaF5F537f37F574CDD24A25C75eFF51E42498703) |
| PlayerThresholdFeed (DON) — oracle feed | [`0x1B0F…51efD`](https://wirefluidscan.com/address/0x1B0F274DE9f1A59f547bfC0350821d0079251efD) |
| sUSD (MockERC20) — demo stablecoin | [`0xE937…087D3`](https://wirefluidscan.com/address/0xE937e83aE59f62fF1e03Ffc4F7aa935beF4087D3) |

---

## Architecture

```
  PSL qualifier · U19 district final · school-league final
                              │
                              ▼ live scorecard (CricAPI, ESPN, signed local scorer)
             DON node-operator adapter (services/node-operator)
                              │ multi-source consensus + ECDSA quorum
                              ▼
       PlayerThresholdFeed.pushStat(playerId, statKey, value)
                              │  thresholdMet flips true
                              ▼
  ┌──────────────────────────────────────────────────────┐
  │                 ScholarshipVault                     │
  │  claim(id) → require(thresholdMet) → transfer       │
  └─────┬───────────────────────────────────────┬────────┘
        │                                       │
        ▼                                       ▼
   ScholarshipDAO                       DirectSponsorship
  (coaches, federations                 (individual backers,
   vote to fund scholarships)           alumni, brands)
        │                                       │
        └────────────────┬──────────────────────┘
                         ▼
               Player wallet · ~5s finality
```

Three trust properties combined:

1. **Oracle trust** — the feed contract we read from isn't ours. It's imported verbatim from the [DON (Decentralized Oracle Network) repo](https://github.com/blindgemaster/fact). If their oracle is correct, ours is.
2. **Economic trust** — attestors (regional PCB officers, school heads, registered U19 selectors) post stake that slashes if they vouch for a fake player or falsified age.
3. **Multi-source trust** — our grassroots adapter accepts scorecards only when a majority of independent scorers (umpire app, tournament scorer, coach tablet) sign the same numbers.

---

## Repository layout

```
wirefluid_hackathon/
├── src/                    # 4 hackathon contracts (Solidity 0.8.28)
│   ├── PlayerRegistry.sol      attestor-vouched player profiles (age 6–25)
│   ├── ScholarshipVault.sol    oracle-gated escrow — the release primitive
│   ├── DirectSponsorship.sol   1:1 sponsor commits with reclaim deadline
│   ├── ScholarshipDAO.sol      weighted-vote governance
│   └── interfaces/…
├── test/                   # 21/21 Foundry tests, green
├── script/                 # DeployAll.s.sol, Demo.s.sol
├── dapp/                   # Vite + React + wagmi dapp (deployed to Vercel)
│   ├── src/pages/{Scholarship,Sponsor,Register}Page.tsx
│   └── api/register.ts         Vercel serverless attestor relay
├── oracle-feeder/          # Off-chain node that pushes stats (simulated | CricAPI)
└── DEPLOY.md               # Full deployment walkthrough
```

The project **deliberately stays thin** — all oracle primitives (schemas, aggregators, node-operator scaffolding, attestation tiers) live in the [DON repo](https://github.com/blindgemaster/fact) and are referenced via the `don/` Solidity remapping in `foundry.toml`.

---

## Tests — 21/21 green

```
$ forge test
ScholarshipVault.t.sol         9 passed   oracle-gated escrow paths
DirectSponsorship.t.sol        5 passed   commit / claim / reclaim semantics
ScholarshipDAO.t.sol           4 passed   quorum + proposal lifecycle
Integration.t.sol              3 passed   live against the real DON feed, no mocks
─────────────────────────────────────────────────────────────────
21 passed, 0 failed, 0 skipped — ~17ms total
```

Plus **29/29 TypeScript tests** in [fact/services/node-operator](https://github.com/blindgemaster/fact/tree/main/services/node-operator) for the grassroots scorecard adapter.

**The integration suite is the pitch's backbone:** it imports the DON's `PlayerThresholdFeed.sol` verbatim and pays a scholarship against it. If the DON composes, we compose.

---

## Run it locally

```bash
# 1. Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# 2. Checkout the DON repo next to this one (../fact) — we remap to it
git clone https://github.com/blindgemaster/fact ../fact

# 3. Build + test
forge build
forge test -vv

# 4. (Optional) Redeploy to WireFluid from scratch — see DEPLOY.md
```

## Live-data integration (PSL / IPL / county / school match)

The [oracle-feeder/](oracle-feeder/) directory is the off-chain half. Two modes:

- **Simulated match** — scripted 80-second T20 innings, deterministic for Loom recording.
- **CricAPI live** — polls a real match. Verified live against an in-play IPL 2026 fixture during development; the same code path handles PSL, BBL, county, and school-league scorecards — anything CricAPI covers.

See [oracle-feeder/README.md](oracle-feeder/README.md) for usage.

---

## What the hackathon judges get to see on-screen

| Beat | What's visible |
|---|---|
| **Hook** | Player card on `/scholarship` — registered in a PSL feeder tournament, age 17, threshold 50 runs |
| **Oracle push** | Terminal prints `RUNS_PER_INNINGS → 63 · tx 0x1be8e4…` — real on-chain transaction |
| **Progress bar** | Green fill live-ticks in the browser, pill flips to **Ready to claim** |
| **Payout** | `claim()` tx fires, player wallet balance `989,000 → 990,000 sUSD` in one block |
| **Explorer** | All visible on [wirefluidscan.com](https://wirefluidscan.com) in real time |

Total elapsed from oracle push to payout: **~10 seconds**. Not a mock, not a dev chain — real WireFluid testnet.

---

## Why WireFluid

| Dimension | Why it matters here |
|---|---|
| **~5s instant finality** (CometBFT) | A teenager in a village sees funds in the same camera shot as his fifty |
| **Full EVM compatibility** | Solidity 0.8.28, Foundry, MetaMask — nothing custom |
| **Stable, low gas** | Micro-scholarships ($20, $50) stay economically viable |
| **Native IBC** | Sponsors on any Cosmos app-chain fund scholarships without a bridge — no bridge hacks, no trust in a multisig |

---

## Production roadmap

This is a hackathon submission, not a production system. To ship for real:

1. **Swap deployer-EOA aggregator for the DON's `Aggregator.sol`** — multi-signer ECDSA quorum before `pushStat` succeeds. One tx, no contract changes.
2. **Wire PCB / federation KYC to `AttestationRegistry`** — tiered attestors with bonded stake that slashes on age fraud or identity theft. The DON repo ships this primitive; we'd just integrate.
3. **Real stablecoin** — swap sUSD for an IBC-delivered stablecoin (or wrapped WIRE once mainnet).
4. **Timelock on the DAO** — 48h delay on treasury actions with a guardian veto.
5. **Bigger adapter network** — CricAPI + ESPN Cricinfo + SportRadar cross-checked per node, 3+ independent DON nodes signing.

Each of these is one-day work once hackathon is done.

---

## Acknowledgements

- **[Decentralized Oracle Network (DON)](https://github.com/blindgemaster/fact)** — the oracle infrastructure our contracts compose with. All multi-source consensus, schema registry, node-operator scaffolding, and attestation primitives live there.
- **[WireFluid](https://docs.wirefluid.com)** — testnet, chain 92533.
- **ICC Next In 2.0** — Coaching and Grassroots Participation track.

## License

MIT. See [LICENSE](LICENSE) if present.
