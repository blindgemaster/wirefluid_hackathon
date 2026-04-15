import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  isAddress,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

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

const CHAIN = {
  id: 92533,
  name: "WireFluid Testnet",
  nativeCurrency: { name: "WireFluid", symbol: "WIRE", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm.wirefluid.com"] } },
} as const;

const PLAYER_REGISTRY = "0xEE8Fa28D81AF46C3b382BB5bdE7655b3dBd1630F" as const;

const REGISTRY_ABI = parseAbi([
  "function register(bytes32 playerId, address wallet, uint16 age, string region) external",
  "function activate(bytes32 playerId) external",
  "function getPlayer(bytes32 playerId) external view returns (tuple(bytes32 playerId, address wallet, address attestor, uint16 age, string region, uint8 status, uint256 registeredAt))",
  "function isAttestor(address) external view returns (bool)",
]);

// Very light rate limiting — in-memory, per-cold-start. Good enough to slow
// down casual abuse. For real load use @vercel/kv or similar.
const recentRequests = new Map<string, number>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 3; // 3 registrations per minute per IP

function rateLimited(ip: string): boolean {
  const now = Date.now();
  // prune old entries
  for (const [k, t] of recentRequests) {
    if (now - t > RATE_WINDOW_MS) recentRequests.delete(k);
  }
  let count = 0;
  for (const [k, t] of recentRequests) {
    if (k.startsWith(ip + ":") && now - t <= RATE_WINDOW_MS) count++;
  }
  if (count >= RATE_LIMIT) return true;
  recentRequests.set(`${ip}:${now}`, now);
  return false;
}

interface Body {
  label?: string;
  wallet?: string;
  age?: number;
  region?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  const privateKey = process.env.REGISTRAR_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    return res.status(500).json({ ok: false, error: "REGISTRAR_PRIVATE_KEY not configured" });
  }

  const rpcUrl = process.env.WIREFLUID_RPC_URL ?? "https://evm.wirefluid.com";

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ??
    req.socket?.remoteAddress ??
    "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Rate limit: 3/minute per IP" });
  }

  const body: Body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { label, wallet, age, region } = body;

  // Validate input
  if (typeof label !== "string" || label.trim().length < 3 || label.length > 80) {
    return res.status(400).json({ ok: false, error: "Invalid label (3–80 chars)" });
  }
  const cleanLabel = label.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(cleanLabel)) {
    return res.status(400).json({ ok: false, error: "Label may only contain A–Z, 0–9, and hyphens" });
  }
  if (typeof wallet !== "string" || !isAddress(wallet)) {
    return res.status(400).json({ ok: false, error: "Invalid wallet address" });
  }
  if (typeof age !== "number" || age < 6 || age > 25) {
    return res.status(400).json({ ok: false, error: "Age must be 6–25" });
  }
  if (typeof region !== "string" || region.trim().length < 2 || region.length > 40) {
    return res.status(400).json({ ok: false, error: "Invalid region" });
  }

  const playerId = keccak256(stringToHex(cleanLabel));

  const account = privateKeyToAccount(privateKey as Hex);
  const publicClient = createPublicClient({ chain: CHAIN, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: CHAIN, transport: http(rpcUrl) });

  try {
    // Safety: make sure our key is actually an attestor and the player isn't already registered
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
      return res
        .status(500)
        .json({ ok: false, error: `Registrar ${account.address} is not an attestor on-chain.` });
    }
    if ((existing as any).status !== 0) {
      return res.status(409).json({ ok: false, error: "Player label already registered" });
    }

    // Register (attestor-gated)
    const registerHash = await walletClient.writeContract({
      address: PLAYER_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "register",
      args: [playerId, wallet as Hex, age, region.trim()],
    });
    await publicClient.waitForTransactionReceipt({ hash: registerHash });

    // Activate (owner-gated — same key owns the registry in the testnet deploy)
    const activateHash = await walletClient.writeContract({
      address: PLAYER_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "activate",
      args: [playerId],
    });
    await publicClient.waitForTransactionReceipt({ hash: activateHash });

    return res.status(200).json({
      ok: true,
      playerId,
      label: cleanLabel,
      txHash: activateHash, // last tx is what the user clicks to see on the explorer
      registerTxHash: registerHash,
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) });
  }
}
