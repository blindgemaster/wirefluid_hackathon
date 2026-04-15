# Cricket Scholarship DAO — public dapp

The browser-facing half of the **[Cricket Scholarship DAO](../README.md)** hackathon submission.
Standalone Vite + React app that ships cleanly to Vercel.

Three flows against the live [WireFluid testnet](https://wirefluidscan.com) deployment:

| Route | Audience | What happens |
|---|---|---|
| `/` | Demo driver (the Loom) | Push match stats and trigger scholarship payouts |
| `/sponsor` | Sponsor — individual backer, alumnus, brand | Browse registered players; pledge against a milestone (fifty, five-fer, etc.) |
| `/register` | Anyone | Gasless registration of a new grassroots player via a trusted attestor relay |

---

## Run locally

```bash
cd dapp
npm install --legacy-peer-deps
cp .env.example .env.local
# edit .env.local → set REGISTRAR_PRIVATE_KEY (same deployer key from ../.env.local)

npm run dev
# → http://localhost:5180
```

The `/register` form calls `/api/register`, which reads `REGISTRAR_PRIVATE_KEY` from env and
signs on-chain for the user. `vite dev` alone won't run the serverless function — use
`vercel dev` instead for a full local stack:

```bash
npm install -g vercel
vercel dev       # runs Vite + /api serverless route together
```

## Deploy to Vercel

### 1. Push to GitHub

Keep the whole `wirefluid_hackathon` repo on GitHub and tell Vercel to treat `dapp/` as the project root.

### 2. Import

- **New project → import your repo**
- **Root directory**: `dapp`
- Vercel auto-detects Vite (`npm run build`, output `dist`)
- [`vercel.json`](vercel.json) in this directory handles SPA rewrites + `/api` serverless routing

### 3. Environment variables (Vercel dashboard → Settings → Env Vars)

| Variable | Value | Scope |
|---|---|---|
| `REGISTRAR_PRIVATE_KEY` | The testnet deployer key (also granted attestor + registry-owner privileges on our on-chain contracts) | Production |
| `WIREFLUID_RPC_URL` | `https://evm.wirefluid.com` | Production (optional — defaulted if unset) |

⚠️ **Testnet only.** Never put a mainnet key in a Vercel env var without a hardware-backed relayer / KMS.
For this demo the registrar key has ~10 testnet WIRE — worst-case a griefer drains the gas budget, nothing else.

### 4. Deploy

`vercel --prod` once, then every push to `main` auto-redeploys.

Always use the project's **stable production URL** (no deployment hash) when testing — deployment-specific URLs like `...abc123-projects.vercel.app` freeze at the build they came from. The stable URL is shown on the Vercel dashboard under **Production Deployment**.

---

## Architecture

```
Browser  (MetaMask pointed at WireFluid, chain 92533)
     │
     ├─► /          → ScholarshipPage  →  reads PlayerThresholdFeed + Vault
     │                                    writes pushStat (aggregator-only)
     │                                    writes claim    (anyone)
     │
     ├─► /sponsor   → SponsorPage      →  reads PlayerRegistry + DirectSponsorship events
     │                                    writes commit   (user wallet, pays gas)
     │
     └─► /register  → RegisterPage     →  fetch POST /api/register
                                          │
                                          ▼
                        Vercel serverless (REGISTRAR key)
                                          │
                                          ▼
              PlayerRegistry.register → activate
              PlayerThresholdFeed.registerThreshold × 2
                 (50 runs in an innings, 5 wickets in a match)
```

Every new player registered via `/register` automatically gets two default milestones so they're sponsorable on day zero.

### Contract addresses (baked in, no env needed)

| Contract | Address |
|---|---|
| PlayerRegistry | `0xEE8Fa28D81AF46C3b382BB5bdE7655b3dBd1630F` |
| ScholarshipVault | `0x731b5b8CeA87f5AD736C0c4b24Da2a66Fb0302FB` |
| ScholarshipDAO | `0xcaF5F537f37F574CDD24A25C75eFF51E42498703` |
| DirectSponsorship | `0x57833Df6d336C512450f655F892054Be36D02196` |
| PlayerThresholdFeed | `0x1B0F274DE9f1A59f547bfC0350821d0079251efD` |
| sUSD (MockERC20) | `0xE937e83aE59f62fF1e03Ffc4F7aa935beF4087D3` |

See [../DEPLOY.md](../DEPLOY.md) and [../script/DeployAll.s.sol](../script/DeployAll.s.sol) for how they got on-chain.

---

## Gotchas

- **Chain ID 92533 isn't in MetaMask's default chain list.** First-time visitors see a "Switch network" banner on `/`. One click to add.
- **WalletConnect project ID** is a placeholder in [src/wagmi.ts](src/wagmi.ts). MetaMask still connects via the injected provider. For a cleaner console (no 403 warnings from Reown), get a real project ID at [cloud.reown.com](https://cloud.reown.com) and add your Vercel URL to its Allowlist.
- **Event-scan RPC limit.** WireFluid's public RPC caps `eth_getLogs` at 10,000 blocks per call. [src/pages/SponsorPage.tsx](src/pages/SponsorPage.tsx) already chunks its scans so this is invisible; watch it if you swap to a private RPC.
- **Registrar gas.** Each player registration now costs ~300k gas (`register` + `activate` + 2× `registerThreshold`) ≈ 0.006 WIRE. 10-WIRE faucet balance supports ~1,600 registrations before you need a top-up from [faucet.wirefluid.com](https://faucet.wirefluid.com).
- **Label persistence** is `localStorage`-only ([src/labelCache.ts](src/labelCache.ts)). Other browsers won't see your newly-registered players' human names — they show as truncated `Player 0x…`. Fine for single-browser demos; for cross-browser sharing you'd add Vercel KV.

---

## Linking into the rest of the repo

- **[../src/](../src/)** — Solidity contracts the dapp talks to
- **[../oracle-feeder/](../oracle-feeder/)** — the off-chain script that pushes match stats (simulated or live via CricAPI, tested on PSL / IPL scorecards)
- **[../test/](../test/)** — Foundry test suite, 21/21 green
- **[../README.md](../README.md)** — project pitch
