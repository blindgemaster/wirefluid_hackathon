// Generic request/response types — avoids runtime dep on @vercel/node
// which sometimes trips ESM/CJS interop in the Vercel Node runtime.
interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  socket?: { remoteAddress?: string };
}
interface Res {
  status(code: number): Res;
  json(body: unknown): Res;
  setHeader(k: string, v: string): void;
}

/**
 * Gasless player registration relay.
 *
 * The user submits name + wallet + age + region from the browser. This
 * function holds the attestor private key (Vercel env var) and signs the
 * on-chain register() + activate() calls on their behalf.
 *
 * Testnet only. In production this would be replaced by a per-attestor
 * authenticated dashboard with rate limiting, KYC, and bonded stake.
 */

const CHAIN_ID = 92533;
const CHAIN = {
  id: CHAIN_ID,
  name: "WireFluid Testnet",
  nativeCurrency: { name: "WireFluid", symbol: "WIRE", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm.wirefluid.com"] } },
} as const;

const PLAYER_REGISTRY = "0xEE8Fa28D81AF46C3b382BB5bdE7655b3dBd1630F" as const;
const PLAYER_THRESHOLD_FEED = "0x1B0F274DE9f1A59f547bfC0350821d0079251efD" as const;

// Default milestones auto-registered for every new player so they're
// immediately sponsorable. The values match the seed scholarship thresholds.
const DEFAULT_MILESTONES = [
  { statLabel: "RUNS_PER_INNINGS", threshold: 50n, display: "50 runs in an innings" },
  { statLabel: "WICKETS_TAKEN", threshold: 5n, display: "5 wickets in a match" },
] as const;

const FEED_ABI = [
  {
    name: "registerThreshold",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "playerId", type: "bytes32" },
      { name: "statKey", type: "bytes32" },
      { name: "threshold", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getThreshold",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "playerId", type: "bytes32" },
      { name: "statKey", type: "bytes32" },
    ],
    outputs: [
      { name: "threshold", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    name: "admin",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

// Inline ABI — avoid parseAbi at module scope in case esbuild strips something
const REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "playerId", type: "bytes32" },
      { name: "wallet", type: "address" },
      { name: "age", type: "uint16" },
      { name: "region", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "activate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "playerId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "getPlayer",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "playerId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "playerId", type: "bytes32" },
          { name: "wallet", type: "address" },
          { name: "attestor", type: "address" },
          { name: "age", type: "uint16" },
          { name: "region", type: "string" },
          { name: "status", type: "uint8" },
          { name: "registeredAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "isAttestor",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

// In-memory rate limit (per-cold-start instance). Good enough for demo.
const recentRequests = new Map<string, number>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 3;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentRequests) {
    if (now - t > RATE_WINDOW_MS) recentRequests.delete(k);
  }
  let count = 0;
  for (const [k] of recentRequests) {
    if (k.startsWith(ip + ":")) count++;
  }
  if (count >= RATE_LIMIT) return true;
  recentRequests.set(`${ip}:${now}`, now);
  return false;
}

export default async function handler(req: Req, res: Res) {
  // Return JSON for any early error so the frontend can parse it
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "POST only" });
    }

    const privateKey = process.env.REGISTRAR_PRIVATE_KEY;
    if (!privateKey || !privateKey.startsWith("0x") || privateKey.length !== 66) {
      console.error("[register] REGISTRAR_PRIVATE_KEY missing or malformed");
      return res.status(500).json({
        ok: false,
        error:
          "Server not configured: REGISTRAR_PRIVATE_KEY env var is missing or malformed in Vercel.",
      });
    }

    const rpcUrl = process.env.WIREFLUID_RPC_URL ?? "https://evm.wirefluid.com";

    // Lazy-import viem so any resolution error surfaces as a JSON response,
    // not as a module-load crash that Vercel serves as plain HTML.
    const viem = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const ipHdr = req.headers["x-forwarded-for"];
    const ipStr = Array.isArray(ipHdr) ? ipHdr[0] : typeof ipHdr === "string" ? ipHdr : undefined;
    const ip = (ipStr?.split(",")[0] ?? "").trim() || req.socket?.remoteAddress || "unknown";
    if (rateLimited(ip)) {
      return res.status(429).json({ ok: false, error: "Rate limit: 3/minute per IP" });
    }

    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ ok: false, error: "Body is not valid JSON" });
      }
    }
    if (!body || typeof body !== "object") {
      return res.status(400).json({ ok: false, error: "Missing JSON body" });
    }

    const { label, wallet, age, region } = body as {
      label?: string;
      wallet?: string;
      age?: number;
      region?: string;
    };

    if (typeof label !== "string" || label.trim().length < 3 || label.length > 80) {
      return res.status(400).json({ ok: false, error: "Invalid label (3–80 chars)" });
    }
    const cleanLabel = label.trim().toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(cleanLabel)) {
      return res
        .status(400)
        .json({ ok: false, error: "Label may only contain A–Z, 0–9, and hyphens" });
    }
    if (typeof wallet !== "string" || !viem.isAddress(wallet)) {
      return res.status(400).json({ ok: false, error: "Invalid wallet address" });
    }
    if (typeof age !== "number" || age < 6 || age > 25) {
      return res.status(400).json({ ok: false, error: "Age must be 6–25" });
    }
    if (typeof region !== "string" || region.trim().length < 2 || region.length > 40) {
      return res.status(400).json({ ok: false, error: "Invalid region" });
    }

    const playerId = viem.keccak256(viem.stringToHex(cleanLabel));
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const publicClient = viem.createPublicClient({ chain: CHAIN, transport: viem.http(rpcUrl) });
    const walletClient = viem.createWalletClient({
      account,
      chain: CHAIN,
      transport: viem.http(rpcUrl),
    });

    const [isAttestor, existing] = await Promise.all([
      publicClient.readContract({
        address: PLAYER_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "isAttestor",
        args: [account.address],
      }),
      publicClient.readContract({
        address: PLAYER_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "getPlayer",
        args: [playerId],
      }),
    ]);

    if (!isAttestor) {
      return res.status(500).json({
        ok: false,
        error: `Registrar ${account.address} is not an attestor on-chain. Grant it via PlayerRegistry.setAttestor().`,
      });
    }
    if ((existing as { status: number }).status !== 0) {
      return res.status(409).json({ ok: false, error: "Player label already registered" });
    }

    console.log("[register]", { label: cleanLabel, wallet, age, region });

    const registerHash = await walletClient.writeContract({
      address: PLAYER_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "register",
      args: [playerId, wallet as `0x${string}`, age, region.trim()],
    });
    await publicClient.waitForTransactionReceipt({ hash: registerHash });

    const activateHash = await walletClient.writeContract({
      address: PLAYER_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "activate",
      args: [playerId],
    });
    await publicClient.waitForTransactionReceipt({ hash: activateHash });

    // --- Auto-register default milestones -------------------------------------
    // Only if the registrar is also admin of the feed. If not, silently skip —
    // the player is still registered and activated; an attestor can add
    // milestones later via cast or a future admin UI.
    let feedAdmin: string | undefined;
    try {
      feedAdmin = (await publicClient.readContract({
        address: PLAYER_THRESHOLD_FEED,
        abi: FEED_ABI,
        functionName: "admin",
      })) as string;
    } catch {
      feedAdmin = undefined;
    }
    const isFeedAdmin =
      !!feedAdmin && feedAdmin.toLowerCase() === account.address.toLowerCase();

    const registeredMilestones: { statLabel: string; threshold: string; display: string; txHash?: string }[] =
      [];

    if (isFeedAdmin) {
      for (const m of DEFAULT_MILESTONES) {
        const statKey = viem.keccak256(viem.stringToHex(m.statLabel));
        try {
          // Skip if already registered (the on-chain contract reverts on re-register,
          // so this check protects against that edge case).
          const [, exists] = (await publicClient.readContract({
            address: PLAYER_THRESHOLD_FEED,
            abi: FEED_ABI,
            functionName: "getThreshold",
            args: [playerId, statKey],
          })) as readonly [bigint, boolean];

          if (exists) {
            registeredMilestones.push({
              statLabel: m.statLabel,
              threshold: m.threshold.toString(),
              display: m.display,
            });
            continue;
          }

          const hash = await walletClient.writeContract({
            address: PLAYER_THRESHOLD_FEED,
            abi: FEED_ABI,
            functionName: "registerThreshold",
            args: [playerId, statKey, m.threshold],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          registeredMilestones.push({
            statLabel: m.statLabel,
            threshold: m.threshold.toString(),
            display: m.display,
            txHash: hash,
          });
        } catch (err) {
          // Log but don't fail the whole registration — the core register/activate
          // already succeeded. The milestone can be added by admin later.
          console.error(`[register] milestone ${m.statLabel} failed:`, (err as Error).message);
        }
      }
    } else {
      console.warn(
        `[register] registrar ${account.address} is not the feed admin (${feedAdmin}); skipping default milestones`,
      );
    }

    return res.status(200).json({
      ok: true,
      playerId,
      label: cleanLabel,
      txHash: activateHash,
      registerTxHash: registerHash,
      milestones: registeredMilestones,
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[register] uncaught:", msg, err);
    return res.status(500).json({ ok: false, error: msg.slice(0, 400) });
  }
}
