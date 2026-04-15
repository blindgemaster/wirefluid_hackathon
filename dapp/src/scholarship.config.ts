import { keccak256, stringToHex, type Hex } from "viem";

/**
 * Live Cricket Scholarship DAO deployment on WireFluid testnet.
 * Contracts deployed from ../../../../wirefluid_hackathon on 2026-04-15.
 */

export const SCHOLARSHIP_CHAIN_ID = 92533;

export const SCHOLARSHIP_CONTRACTS = {
  token: "0xE937e83aE59f62fF1e03Ffc4F7aa935beF4087D3",
  playerThresholdFeed: "0x1B0F274DE9f1A59f547bfC0350821d0079251efD",
  playerRegistry: "0xEE8Fa28D81AF46C3b382BB5bdE7655b3dBd1630F",
  scholarshipVault: "0x731b5b8CeA87f5AD736C0c4b24Da2a66Fb0302FB",
  scholarshipDAO: "0xcaF5F537f37F574CDD24A25C75eFF51E42498703",
  directSponsorship: "0x57833Df6d336C512450f655F892054Be36D02196",
} as const satisfies Record<string, Hex>;

// Seed identifiers — match DeployAll.s.sol + Demo.s.sol
export const SEED_PLAYER_LABEL = "PAK-KPK-U17-RASHID-001";
export const SEED_PLAYER_ID: Hex = keccak256(stringToHex(SEED_PLAYER_LABEL));
export const SEED_STAT_LABEL = "RUNS_PER_INNINGS";
export const SEED_STAT_KEY: Hex = keccak256(stringToHex(SEED_STAT_LABEL));
export const SEED_THRESHOLD = 50n;
export const SEED_SCHOLARSHIP_ID = 1n;
export const SEED_DEMO_RUNS = 63n;

export const WIREFLUID_EXPLORER = "https://wirefluidscan.com";

/// Deployment block on WireFluid — used as the lower bound for event scans.
/// Actual deploy started at block 903162; we sit a handful of blocks earlier.
export const DEPLOY_BLOCK = 903_100n;

/// WireFluid public RPC caps `eth_getLogs` at 10,000 blocks per request.
/// Stay safely under that when scanning, and chunk longer ranges.
export const MAX_LOG_RANGE = 9_500n;

/// Human-readable labels for well-known stat keys. Falls back to a short
/// hex suffix for anything else.
export const STAT_LABELS: Record<string, { label: string; unit: string }> = {
  [SEED_STAT_KEY.toLowerCase()]: { label: "Runs in an innings", unit: "runs" },
  [keccak256(stringToHex("WICKETS_TAKEN")).toLowerCase()]: { label: "Wickets taken", unit: "wickets" },
  [keccak256(stringToHex("FOURS_HIT")).toLowerCase()]: { label: "Fours hit", unit: "fours" },
  [keccak256(stringToHex("SIXES_HIT")).toLowerCase()]: { label: "Sixes hit", unit: "sixes" },
  [keccak256(stringToHex("BALLS_FACED")).toLowerCase()]: { label: "Balls faced", unit: "balls" },
  [keccak256(stringToHex("MAIDEN_OVERS")).toLowerCase()]: { label: "Maiden overs", unit: "maidens" },
  [keccak256(stringToHex("HIGHEST_SCORE")).toLowerCase()]: { label: "Highest score", unit: "runs" },
  [keccak256(stringToHex("TOTAL_RUNS_TOURNAMENT")).toLowerCase()]: { label: "Total tournament runs", unit: "runs" },
  [keccak256(stringToHex("TOTAL_WICKETS_TOURNAMENT")).toLowerCase()]: { label: "Total tournament wickets", unit: "wickets" },
};

export function labelForStatKey(key: Hex): { label: string; unit: string } {
  return (
    STAT_LABELS[key.toLowerCase()] ?? {
      label: `Milestone ${key.slice(0, 10)}…`,
      unit: "units",
    }
  );
}
