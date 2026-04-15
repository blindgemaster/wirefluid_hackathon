# Cricket Scholarship DAO — public dapp

Single-page app that exposes three flows against the live [WireFluid testnet](https://wirefluidscan.com) deployment:

| Route | Role | What it does |
|---|---|---|
| `/` | Demo driver | Push stats and claim scholarships — the Loom main beat |
| `/sponsor` | Sponsor | Browse registered players and pledge a direct sponsorship against a milestone |
| `/register` | Attestor-relayed | Gasless registration of a new grassroots player via a trusted attestor |

Standalone Vite app — no workspace dependencies. Clean Vercel deploy.

---

## Run locally

```bash
cd dapp
npm install
cp .env.example .env.local
# edit .env.local → set REGISTRAR_PRIVATE_KEY (same deployer key from hackathon .env.local)

npm run dev
# → http://localhost:5180
```

The `/register` form calls `/api/register`, which reads `REGISTRAR_PRIVATE_KEY` from env and signs on-chain on behalf of the user. For pure `vite dev` mode this API route won't run — use `vercel dev` (see below) to test the full flow locally.

```bash
npm install -g vercel
vercel dev       # runs the Vite app + the /api serverless function together
```

## Deploy to Vercel

### 1. Push the `dapp/` subfolder to GitHub

The simplest path: keep the whole `wirefluid_hackathon` repo on GitHub and tell Vercel to treat `dapp/` as the project root.

### 2. Import into Vercel

- New project → import your repo
- **Root directory**: `dapp`
- Vercel auto-detects Vite (build command `npm run build`, output `dist`)
- The `vercel.json` in this directory handles SPA rewrites + serverless routing

### 3. Set environment variables in Vercel dashboard

| Variable | Value | Notes |
|---|---|---|
| `REGISTRAR_PRIVATE_KEY` | `0x5dcd…05ab` | The deployer key that's pre-granted attestor + registry-owner privileges on the testnet contracts |
| `WIREFLUID_RPC_URL` | `https://evm.wirefluid.com` | Optional — defaults to this if unset |

⚠️ **Testnet only.** Never put a mainnet private key in a Vercel env var without a hardware-backed relayer / KMS. For the hackathon demo the registrar key has ~10 testnet WIRE — worst case a griefer drains the gas budget, nothing else.

### 4. Deploy

Every push to the default branch triggers a redeploy. The app URL will be something like `cricket-scholarship.vercel.app`.

## Architecture

```
Browser (any wallet, any network)
     │
     │  MetaMask + WireFluid chain 92533
     │
     ├─► /          → ScholarshipPage  →  reads PlayerThresholdFeed + ScholarshipVault
     │                                    writes pushStat (aggregator-only, usually deployer)
     │                                    writes claim    (anyone)
     │
     ├─► /sponsor   → SponsorPage      →  reads PlayerRegistry + DirectSponsorship events
     │                                    writes commit   (user wallet, pays gas)
     │
     └─► /register  → RegisterPage     →  fetch POST /api/register
                                          ↓
                            Vercel serverless function (REGISTRAR key)
                                          ↓
                            PlayerRegistry.register(...) + activate(...)
```

## Contract addresses (baked in — no env needed)

| Contract | Address |
|---|---|
| PlayerRegistry | `0xEE8Fa28D81AF46C3b382BB5bdE7655b3dBd1630F` |
| ScholarshipVault | `0x731b5b8CeA87f5AD736C0c4b24Da2a66Fb0302FB` |
| ScholarshipDAO | `0xcaF5F537f37F574CDD24A25C75eFF51E42498703` |
| DirectSponsorship | `0x57833Df6d336C512450f655F892054Be36D02196` |
| PlayerThresholdFeed | `0x1B0F274DE9f1A59f547bfC0350821d0079251efD` |
| sUSD (MockERC20) | `0xE937e83aE59f62fF1e03Ffc4F7aa935beF4087D3` |

See [../DEPLOY.md](../DEPLOY.md) for how they were deployed and `DeployAll.s.sol` for the Foundry source.

## Gotchas

- **Chain ID 92533 isn't in MetaMask's default list.** First-time visitors will see a "Switch network" banner on `/`. Clicking it adds WireFluid to their wallet.
- **WalletConnect project ID** is a placeholder. Wallet connection still works via the injected (MetaMask) provider. For a production link-in-a-tweet flow, replace `projectId` in [src/wagmi.ts](src/wagmi.ts) with a real one from [cloud.reown.com](https://cloud.reown.com).
- **Event-scan RPC limit.** WireFluid's public RPC caps `eth_getLogs` at 10,000 blocks per call. The sponsor page already chunks its scans, so this is handled — but if you swap to a private RPC with different limits, verify the sponsor page still loads.
- **Registrar gas**: each registration costs ~180k gas → ~0.004 WIRE at 20 gwei. The testnet key has 10 WIRE, so budget for ~2,500 registrations before needing a top-up from the [faucet](https://faucet.wirefluid.com).
