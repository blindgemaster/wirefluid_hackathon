/**
 * Oracle Feeder — pushes live cricket stats into the WireFluid
 * PlayerThresholdFeed that backs the Cricket Scholarship DAO.
 *
 * Two modes, chosen via the FEED_MODE env var:
 *
 *   simulated — plays back a scripted 80-second innings at real-time pace.
 *               No external API needed. Deterministic for Loom recording.
 *
 *   cricapi   — polls https://api.cricapi.com/v1/match_scorecard every
 *               POLL_INTERVAL_SEC, extracts per-player runs, and pushes any
 *               delta on-chain. Requires CRICAPI_KEY + CRICAPI_MATCH_ID.
 *
 * In production, the signer here would be a DON node-operator whose
 * signature is aggregated via Aggregator.sol before pushStat is called.
 * For the hackathon the feed's aggregator is the deployer EOA directly —
 * one key pushes, one key signs, keeping the demo legible.
 */

import "dotenv/config";
import {
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = required("WIREFLUID_RPC_URL");
const PRIVATE_KEY = required("PRIVATE_KEY") as Hex;
const FEED_ADDRESS = required("PLAYER_THRESHOLD_FEED") as Hex;
const MODE = (process.env.FEED_MODE ?? "simulated").toLowerCase();
const POLL_SEC = Number(process.env.POLL_INTERVAL_SEC ?? "30");

const CHAIN = {
  id: 92533,
  name: "WireFluid Testnet",
  nativeCurrency: { name: "WireFluid", symbol: "WIRE", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

// Canonical stat keys — must match wirefluid_hackathon + grassroots adapter
const STAT_KEYS = {
  RUNS_PER_INNINGS: keccak256(stringToHex("RUNS_PER_INNINGS")),
  WICKETS_TAKEN: keccak256(stringToHex("WICKETS_TAKEN")),
  FOURS_HIT: keccak256(stringToHex("FOURS_HIT")),
  SIXES_HIT: keccak256(stringToHex("SIXES_HIT")),
} as const;

const FEED_ABI = parseAbi([
  "function pushStat(bytes32 playerId, bytes32 statKey, uint256 value) external",
  "function getStat(bytes32 playerId, bytes32 statKey) external view returns (uint256 value, bool thresholdMet, uint256 updatedAt)",
  "function getThreshold(bytes32 playerId, bytes32 statKey) external view returns (uint256 threshold, bool exists)",
  "function aggregator() external view returns (address)",
]);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function playerIdFromLabel(label: string): Hex {
  return keccak256(stringToHex(label));
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: CHAIN, transport: http(RPC_URL) });

// ---------------------------------------------------------------------------
// Core push function — with dedup so we don't waste gas pushing unchanged values
// ---------------------------------------------------------------------------

const lastPushed = new Map<string, bigint>();
// Cache of (playerId, statKey) combinations whose threshold is registered on
// the DON feed. Populated lazily — we skip any stat whose threshold isn't set
// so the feeder doesn't burn gas on reverts.
const thresholdRegistered = new Map<string, boolean>();

async function isThresholdRegistered(playerId: Hex, statKey: Hex): Promise<boolean> {
  const cacheKey = `${playerId}:${statKey}`;
  const cached = thresholdRegistered.get(cacheKey);
  if (cached !== undefined) return cached;
  const [, exists] = (await publicClient.readContract({
    address: FEED_ADDRESS,
    abi: FEED_ABI,
    functionName: "getThreshold",
    args: [playerId, statKey],
  })) as readonly [bigint, boolean];
  thresholdRegistered.set(cacheKey, exists);
  return exists;
}

async function push(playerLabel: string, statKey: Hex, value: bigint, statLabel: string) {
  const playerId = playerIdFromLabel(playerLabel);
  const dedupKey = `${playerId}:${statKey}`;
  if (lastPushed.get(dedupKey) === value) {
    return; // nothing changed, skip
  }

  // Skip stats the feed doesn't know about — prevents ThresholdNotFound reverts
  if (!(await isThresholdRegistered(playerId, statKey))) {
    return;
  }

  const timestamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(
    `[${timestamp}] ${playerLabel.padEnd(28)} ${statLabel.padEnd(22)} → ${value.toString().padStart(3)} `,
  );

  try {
    const hash = await walletClient.writeContract({
      address: FEED_ADDRESS,
      abi: FEED_ABI,
      functionName: "pushStat",
      args: [playerId, statKey, value],
    });
    lastPushed.set(dedupKey, value);
    console.log(`tx ${hash.slice(0, 10)}… ⏳`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const status = receipt.status === "success" ? "✓" : "✗";
    console.log(`        ${" ".repeat(56)} ${status} confirmed in block ${receipt.blockNumber}`);
  } catch (err) {
    console.log(`FAILED ${(err as Error).message.slice(0, 80)}`);
  }
}

// ---------------------------------------------------------------------------
// Mode 1 — Simulated match
// ---------------------------------------------------------------------------

interface MatchEvent {
  atSec: number;
  player: string;
  statKey: Hex;
  statLabel: string;
  value: bigint;
  narration: string;
}

/**
 * A scripted 80-second T20 innings. Deliberately paced so threshold crossing
 * (50 runs) happens at ~T=54s, giving you a clean ~30s buildup on camera.
 */
const SIMULATED_SCRIPT: MatchEvent[] = [
  { atSec: 3, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 0n, narration: "walks to the crease" },
  { atSec: 10, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 4n, narration: "drives through covers for FOUR" },
  { atSec: 18, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 10n, narration: "single + five-run bye + single" },
  { atSec: 26, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 18n, narration: "lofted over long-on for SIX" },
  { atSec: 34, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 24n, narration: "tucked for four" },
  { atSec: 42, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 34n, narration: "big over — 2, 4, 1, 1, 2" },
  { atSec: 50, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 42n, narration: "cover drive for FOUR, strike rotated" },
  { atSec: 58, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 53n, narration: "🎉 FIFTY — pulls for SIX to cross the threshold!" },
  { atSec: 66, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 63n, narration: "more boundaries — scholarship unlocked" },
  { atSec: 74, player: "PAK-KPK-U17-RASHID-001", statKey: STAT_KEYS.RUNS_PER_INNINGS, statLabel: "RUNS_PER_INNINGS", value: 75n, narration: "finishes the over at 75*" },
];

async function runSimulated() {
  console.log("─".repeat(80));
  console.log("🏏 Simulated match starting — Rashid at the crease");
  console.log(`   Feed: ${FEED_ADDRESS}`);
  console.log(`   Signer: ${account.address}`);
  console.log("─".repeat(80));

  const started = Date.now();
  for (const ev of SIMULATED_SCRIPT) {
    const wait = ev.atSec * 1000 - (Date.now() - started);
    if (wait > 0) await sleep(wait);

    console.log(`\n  🎙️  ${ev.narration}`);
    await push(ev.player, ev.statKey, ev.value, ev.statLabel);
  }

  console.log("\n─".repeat(80));
  console.log("Match ended. Open the portal to claim the scholarship.");
  console.log("─".repeat(80));
}

// ---------------------------------------------------------------------------
// Mode 2 — CricAPI live poller
// ---------------------------------------------------------------------------

interface CricAPIScorecardResponse {
  status: string;
  info?: string;
  data?: {
    scorecard?: Array<{
      inning?: string;
      batting?: Array<{
        batsman?: { id?: string; name?: string };
        r?: number; // runs
        "4s"?: number;
        "6s"?: number;
      }>;
      bowling?: Array<{
        bowler?: { id?: string; name?: string };
        w?: number; // wickets
      }>;
    }>;
  };
}

interface PlayerBinding {
  cricApiId: string;
  canonicalLabel: string;
}

function parsePlayerMap(raw: string): PlayerBinding[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [cricApiId, canonicalLabel] = pair.split(":").map((p) => p.trim());
      if (!cricApiId || !canonicalLabel) throw new Error(`bad pair in CRICAPI_PLAYER_MAP: "${pair}"`);
      return { cricApiId, canonicalLabel };
    });
}

async function fetchScorecard(apiKey: string, matchId: string): Promise<CricAPIScorecardResponse> {
  const url = `https://api.cricapi.com/v1/match_scorecard?apikey=${apiKey}&id=${matchId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CricAPI HTTP ${res.status}`);
  const json = (await res.json()) as CricAPIScorecardResponse;
  if (json.status !== "success") throw new Error(`CricAPI: ${json.info ?? "failed"}`);
  return json;
}

async function runCricAPI() {
  const apiKey = required("CRICAPI_KEY");
  const matchId = required("CRICAPI_MATCH_ID");
  const bindings = parsePlayerMap(required("CRICAPI_PLAYER_MAP"));

  console.log("─".repeat(80));
  console.log("🏏 CricAPI live mode");
  console.log(`   Match id: ${matchId}`);
  console.log(`   Polling every ${POLL_SEC}s`);
  console.log(`   Tracking ${bindings.length} player(s):`);
  for (const b of bindings) {
    console.log(`     ${b.cricApiId} → ${b.canonicalLabel}`);
  }
  console.log(`   Feed: ${FEED_ADDRESS}`);
  console.log(`   Signer: ${account.address}`);
  console.log("─".repeat(80));

  while (true) {
    try {
      const resp = await fetchScorecard(apiKey, matchId);
      const innings = resp.data?.scorecard ?? [];

      for (const binding of bindings) {
        // Look for the player across all innings — sum runs if they batted twice (Test matches)
        let runs = 0;
        let wickets = 0;
        let fours = 0;
        let sixes = 0;
        for (const inn of innings) {
          for (const b of inn.batting ?? []) {
            if (b.batsman?.id === binding.cricApiId) {
              runs += b.r ?? 0;
              fours += b["4s"] ?? 0;
              sixes += b["6s"] ?? 0;
            }
          }
          for (const b of inn.bowling ?? []) {
            if (b.bowler?.id === binding.cricApiId) {
              wickets += b.w ?? 0;
            }
          }
        }

        // Push whichever stats have values. Dedup happens inside push().
        if (runs > 0) {
          await push(binding.canonicalLabel, STAT_KEYS.RUNS_PER_INNINGS, BigInt(runs), "RUNS_PER_INNINGS");
        }
        if (wickets > 0) {
          await push(binding.canonicalLabel, STAT_KEYS.WICKETS_TAKEN, BigInt(wickets), "WICKETS_TAKEN");
        }
        if (fours > 0) {
          await push(binding.canonicalLabel, STAT_KEYS.FOURS_HIT, BigInt(fours), "FOURS_HIT");
        }
        if (sixes > 0) {
          await push(binding.canonicalLabel, STAT_KEYS.SIXES_HIT, BigInt(sixes), "SIXES_HIT");
        }
      }
    } catch (err) {
      console.error(`[poll] ${(err as Error).message}`);
    }

    await sleep(POLL_SEC * 1000);
  }
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function preflight() {
  const [balance, aggregator] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({ address: FEED_ADDRESS, abi: FEED_ABI, functionName: "aggregator" }),
  ]);
  console.log(`Signer WIRE balance: ${(Number(balance) / 1e18).toFixed(4)}`);
  if (aggregator.toLowerCase() !== account.address.toLowerCase()) {
    console.warn(
      `⚠️  Signer ${account.address} is NOT the feed's aggregator (${aggregator}).\n` +
        `    pushStat calls will revert. Either import the aggregator key, or call\n` +
        `    PlayerThresholdFeed.transferAdmin + set a new aggregator.`,
    );
  } else {
    console.log(`Aggregator match: ✓`);
  }
}

(async () => {
  await preflight();
  if (MODE === "simulated") return runSimulated();
  if (MODE === "cricapi") return runCricAPI();
  throw new Error(`unknown FEED_MODE "${MODE}" (expected simulated | cricapi)`);
})().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
