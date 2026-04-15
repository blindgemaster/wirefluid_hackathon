import { keccak256, stringToHex, type Hex } from "viem";

/**
 * Human-readable label cache for player IDs.
 *
 * The on-chain `playerId` is `keccak256(label)`, a one-way hash — the label
 * itself isn't emitted in events or stored in the Player struct. To show
 * friendly names, we keep a client-side map:
 *
 *   - KNOWN is baked in at build time (seed players, well-known demo entries).
 *   - Newly-registered players are appended to localStorage so the person who
 *     just registered sees their label immediately on the /sponsor page.
 *
 * Cross-browser labels would need a backend store (Vercel KV, etc.) — out of
 * scope for the hackathon. For the Loom demo and single-judge testing this
 * gives the right UX.
 */

const STORAGE_KEY = "cricket-scholarship:player-labels";

const KNOWN: Record<string, string> = {
  [keccak256(stringToHex("PAK-KPK-U17-RASHID-001")).toLowerCase()]:
    "PAK-KPK-U17-RASHID-001",
};

type Map = Record<string, string>;

function readStore(): Map {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Map) : {};
  } catch {
    return {};
  }
}

export function saveLabel(playerId: Hex, label: string): void {
  try {
    const map = readStore();
    map[playerId.toLowerCase()] = label;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort; silently ignore if storage is unavailable (private mode, etc.)
  }
}

export function getLabel(playerId: Hex): string | null {
  const lower = playerId.toLowerCase();
  if (KNOWN[lower]) return KNOWN[lower];
  const map = readStore();
  return map[lower] ?? null;
}

/** Short, friendly display string — label if we know it, else truncated hex. */
export function playerDisplay(playerId: Hex): string {
  const label = getLabel(playerId);
  if (label) return label;
  return `Player ${playerId.slice(0, 10)}…${playerId.slice(-4)}`;
}
