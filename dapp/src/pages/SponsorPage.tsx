import React, { useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseAbiItem, parseUnits, type Hex } from "viem";
import { colors, styles } from "../theme.js";
import {
  DEPLOY_BLOCK,
  MAX_LOG_RANGE,
  SCHOLARSHIP_CHAIN_ID,
  SCHOLARSHIP_CONTRACTS,
  WIREFLUID_EXPLORER,
  labelForStatKey,
} from "../scholarship.config.js";
import {
  directSponsorshipAbi,
  erc20Abi,
  playerRegistryAbi,
} from "../abi/scholarship.js";
import { playerThresholdFeedAbi } from "../abi/playerThresholdFeed.js";
import { playerDisplay } from "../labelCache.js";

const STATUS_LABELS = ["None", "Pending", "Active", "Suspended"];

// ---------------------------------------------------------------------------
// Event-scan hooks
// ---------------------------------------------------------------------------

const PLAYER_REGISTERED = parseAbiItem(
  "event PlayerRegistered(bytes32 indexed playerId, address indexed wallet, address indexed attestor)",
);
const THRESHOLD_REGISTERED = parseAbiItem(
  "event ThresholdRegistered(bytes32 indexed playerId, bytes32 indexed statKey, uint256 threshold)",
);
const COMMITTED = parseAbiItem(
  "event Committed(uint256 indexed id, address indexed sponsor, bytes32 indexed playerId, bytes32 statKey, uint256 threshold, uint256 amount, uint64 deadline, string message)",
);

/**
 * WireFluid public RPC rejects `eth_getLogs` spanning more than ~10k blocks.
 * Chunk the request into MAX_LOG_RANGE-sized windows and concatenate results.
 * Chunks run sequentially to avoid triggering RPC rate limits.
 */
async function getLogsChunked<T extends { getLogs: Function; getBlockNumber: () => Promise<bigint> }>(
  client: T,
  args: {
    address: Hex;
    event: ReturnType<typeof parseAbiItem>;
    fromBlock: bigint;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventArgs?: any;
  },
): Promise<any[]> {
  const latest = await client.getBlockNumber();
  const out: any[] = [];
  for (let start = args.fromBlock; start <= latest; start += MAX_LOG_RANGE) {
    const end = start + MAX_LOG_RANGE - 1n > latest ? latest : start + MAX_LOG_RANGE - 1n;
    const chunk = await (client as any).getLogs({
      address: args.address,
      event: args.event,
      args: args.eventArgs,
      fromBlock: start,
      toBlock: end,
    });
    out.push(...chunk);
  }
  return out;
}

function useAllPlayerIds() {
  const client = usePublicClient({ chainId: SCHOLARSHIP_CHAIN_ID });
  return useQuery({
    queryKey: ["scholarship", "players", SCHOLARSHIP_CHAIN_ID],
    enabled: !!client,
    refetchInterval: 12_000,
    queryFn: async () => {
      if (!client) return [] as Hex[];
      const logs = await getLogsChunked(client, {
        address: SCHOLARSHIP_CONTRACTS.playerRegistry,
        event: PLAYER_REGISTERED,
        fromBlock: DEPLOY_BLOCK,
      });
      const seen = new Set<string>();
      const out: Hex[] = [];
      for (const log of logs) {
        const id = log.args.playerId as Hex | undefined;
        if (!id) continue;
        if (!seen.has(id.toLowerCase())) {
          seen.add(id.toLowerCase());
          out.push(id);
        }
      }
      return out;
    },
  });
}

function useThresholdsFor(playerId: Hex | undefined) {
  const client = usePublicClient({ chainId: SCHOLARSHIP_CHAIN_ID });
  return useQuery({
    queryKey: ["scholarship", "thresholds", SCHOLARSHIP_CHAIN_ID, playerId ?? ""],
    enabled: !!client && !!playerId,
    refetchInterval: 12_000,
    queryFn: async () => {
      if (!client || !playerId) return [] as Array<{ statKey: Hex; threshold: bigint }>;
      const logs = await getLogsChunked(client, {
        address: SCHOLARSHIP_CONTRACTS.playerThresholdFeed,
        event: THRESHOLD_REGISTERED,
        eventArgs: { playerId },
        fromBlock: DEPLOY_BLOCK,
      });
      // Dedup on statKey (a threshold can be re-registered only once anyway, but be safe)
      const map = new Map<string, { statKey: Hex; threshold: bigint }>();
      for (const l of logs) {
        const key = l.args.statKey as Hex | undefined;
        const thr = l.args.threshold as bigint | undefined;
        if (!key || thr === undefined) continue;
        map.set(key.toLowerCase(), { statKey: key, threshold: thr });
      }
      return Array.from(map.values());
    },
  });
}

interface CommitmentLog {
  id: bigint;
  sponsor: Hex;
  playerId: Hex;
  statKey: Hex;
  threshold: bigint;
  amount: bigint;
  deadline: bigint;
  message: string;
}

function useCommitmentsFor(playerId: Hex | undefined) {
  const client = usePublicClient({ chainId: SCHOLARSHIP_CHAIN_ID });
  return useQuery({
    queryKey: ["scholarship", "commitments", SCHOLARSHIP_CHAIN_ID, playerId ?? ""],
    enabled: !!client && !!playerId,
    refetchInterval: 8_000,
    queryFn: async () => {
      if (!client || !playerId) return [] as CommitmentLog[];
      const logs = await getLogsChunked(client, {
        address: SCHOLARSHIP_CONTRACTS.directSponsorship,
        event: COMMITTED,
        eventArgs: { playerId },
        fromBlock: DEPLOY_BLOCK,
      });
      return logs.map<CommitmentLog>((l: any) => ({
        id: l.args.id as bigint,
        sponsor: l.args.sponsor as Hex,
        playerId: l.args.playerId as Hex,
        statKey: l.args.statKey as Hex,
        threshold: l.args.threshold as bigint,
        amount: l.args.amount as bigint,
        deadline: l.args.deadline as bigint,
        message: (l.args.message as string) ?? "",
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// Presentational primitives
// ---------------------------------------------------------------------------

function Card({
  title,
  children,
  accent,
  style,
  onClick,
}: {
  title?: string;
  children: React.ReactNode;
  accent?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        borderTop: accent ? `3px solid ${accent}` : undefined,
        marginBottom: "16px",
        cursor: onClick ? "pointer" : undefined,
        transition: "box-shadow 0.15s ease, transform 0.15s ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        }
      }}
    >
      {title && (
        <div
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: colors.textMuted,
            fontWeight: 600,
            marginBottom: "12px",
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Pill({ text, tone }: { text: string; tone: "success" | "danger" | "warning" | "info" | "muted" }) {
  const map = {
    success: { bg: colors.successBg, color: colors.successText, border: colors.successBorder },
    danger: { bg: colors.dangerBg, color: colors.dangerText, border: colors.dangerBorder },
    warning: { bg: colors.warningBg, color: colors.warningText, border: colors.warningBorder },
    info: { bg: colors.infoBg, color: colors.infoText, border: colors.infoBorder },
    muted: { bg: "#F1F5F9", color: colors.textSecondary, border: colors.cardBorder },
  } as const;
  const c = map[tone];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        fontSize: "11px",
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  );
}

function AddressLink({ addr, short }: { addr: Hex; short?: boolean }) {
  const label = short ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
  return (
    <a
      href={`${WIREFLUID_EXPLORER}/address/${addr}`}
      target="_blank"
      rel="noreferrer"
      style={{ color: colors.textLink, textDecoration: "none", fontFamily: "monospace", fontSize: "12px" }}
    >
      {label}
    </a>
  );
}

function TxLink({ hash }: { hash: Hex }) {
  return (
    <a
      href={`${WIREFLUID_EXPLORER}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      style={{ color: colors.textLink, textDecoration: "none", fontFamily: "monospace", fontSize: "12px" }}
    >
      {hash.slice(0, 10)}…{hash.slice(-8)} ↗
    </a>
  );
}

// ---------------------------------------------------------------------------
// Player card (shown in the grid)
// ---------------------------------------------------------------------------

type PlayerStruct = {
  playerId: Hex;
  wallet: Hex;
  attestor: Hex;
  age: number;
  region: string;
  status: number;
  registeredAt: bigint;
};

function PlayerTile({
  playerId,
  onSelect,
  selected,
  decimals,
  symbol,
}: {
  playerId: Hex;
  onSelect: () => void;
  selected: boolean;
  decimals: number;
  symbol: string;
}) {
  const playerRead = useReadContract({
    chainId: SCHOLARSHIP_CHAIN_ID,
    address: SCHOLARSHIP_CONTRACTS.playerRegistry,
    abi: playerRegistryAbi,
    functionName: "getPlayer",
    args: [playerId],
    query: { refetchInterval: 12_000 },
  });
  const player = playerRead.data as PlayerStruct | undefined;

  const commitmentsQ = useCommitmentsFor(playerId);
  const totalPledged = useMemo(
    () =>
      (commitmentsQ.data ?? []).reduce<bigint>((sum, c) => sum + c.amount, 0n),
    [commitmentsQ.data],
  );
  const sponsorCount = commitmentsQ.data?.length ?? 0;

  if (!player || player.status === 0) {
    return null; // not fully loaded or not registered
  }

  return (
    <Card
      onClick={onSelect}
      accent={selected ? "#2563EB" : undefined}
      style={{
        marginBottom: 0,
        borderColor: selected ? "#2563EB" : colors.cardBorder,
        background: selected ? "#F8FAFF" : colors.cardBg,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: colors.textPrimary, marginBottom: "2px" }}>
            {shortPlayerLabel(playerId)}
          </div>
          <div style={{ fontSize: "12px", color: colors.textSecondary }}>
            {player.region || "—"} · Age {player.age}
          </div>
        </div>
        <Pill
          text={STATUS_LABELS[player.status] ?? "Unknown"}
          tone={player.status === 2 ? "success" : player.status === 1 ? "warning" : "muted"}
        />
      </div>

      <div
        style={{
          marginTop: "16px",
          paddingTop: "12px",
          borderTop: `1px solid ${colors.cardBorder}`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4px",
          fontSize: "12px",
        }}
      >
        <span style={{ color: colors.textMuted }}>Sponsors</span>
        <span style={{ textAlign: "right", color: colors.textPrimary, fontWeight: 600 }}>{sponsorCount}</span>
        <span style={{ color: colors.textMuted }}>Total pledged</span>
        <span style={{ textAlign: "right", color: colors.textPrimary, fontWeight: 600, fontFamily: "monospace" }}>
          {formatUnits(totalPledged, decimals)} {symbol}
        </span>
      </div>

      <div style={{ marginTop: "16px" }}>
        <button style={{ ...styles.primaryButton, width: "100%" }}>
          {selected ? "Selected ✓" : "Back this player →"}
        </button>
      </div>
    </Card>
  );
}

// Human label comes from src/labelCache.ts: known seed entries first,
// then any labels saved in localStorage when a user registers a new player.
function shortPlayerLabel(id: Hex): string {
  return playerDisplay(id);
}

// ---------------------------------------------------------------------------
// Detail + commit form
// ---------------------------------------------------------------------------

const DEFAULT_AMOUNT = 500n; // human units of sUSD
const DEFAULT_DEADLINE_DAYS = 30;

function isoToUnix(iso: string): bigint {
  // datetime-local returns "YYYY-MM-DDTHH:mm"
  const ms = new Date(iso).getTime();
  return BigInt(Math.floor(ms / 1000));
}

function formatDate(unix: bigint): string {
  if (unix === 0n) return "—";
  const d = new Date(Number(unix) * 1000);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function defaultDeadline(): string {
  const d = new Date(Date.now() + DEFAULT_DEADLINE_DAYS * 24 * 3600 * 1000);
  // pad to YYYY-MM-DDTHH:mm
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}

function SelectedPlayerPanel({
  playerId,
  decimals,
  symbol,
}: {
  playerId: Hex;
  decimals: number;
  symbol: string;
}) {
  const chainId = useChainId();
  const onWirefluid = chainId === SCHOLARSHIP_CHAIN_ID;
  const { address: connected } = useAccount();

  const playerRead = useReadContract({
    chainId: SCHOLARSHIP_CHAIN_ID,
    address: SCHOLARSHIP_CONTRACTS.playerRegistry,
    abi: playerRegistryAbi,
    functionName: "getPlayer",
    args: [playerId],
    query: { refetchInterval: 12_000 },
  });
  const player = playerRead.data as PlayerStruct | undefined;

  const thresholdsQ = useThresholdsFor(playerId);
  const commitmentsQ = useCommitmentsFor(playerId);

  const allowanceRead = useReadContract({
    chainId: SCHOLARSHIP_CHAIN_ID,
    address: SCHOLARSHIP_CONTRACTS.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: connected ? [connected, SCHOLARSHIP_CONTRACTS.directSponsorship] : undefined,
    query: { enabled: !!connected, refetchInterval: 6_000 },
  });
  const allowance = (allowanceRead.data as bigint | undefined) ?? 0n;

  // Form state
  const [statKey, setStatKey] = useState<Hex | "">("");
  const [amountInput, setAmountInput] = useState<string>(DEFAULT_AMOUNT.toString());
  const [deadlineInput, setDeadlineInput] = useState<string>(defaultDeadline());
  const [messageInput, setMessageInput] = useState<string>("");

  // When thresholds load, auto-pick the first one so the form is never blank
  React.useEffect(() => {
    if (!statKey && thresholdsQ.data && thresholdsQ.data.length > 0) {
      setStatKey(thresholdsQ.data[0].statKey);
    }
  }, [thresholdsQ.data, statKey]);

  const chosenThreshold = useMemo(() => {
    return thresholdsQ.data?.find((t) => t.statKey.toLowerCase() === (statKey as string).toLowerCase());
  }, [thresholdsQ.data, statKey]);

  const amountWei = useMemo(() => {
    try {
      return parseUnits(amountInput || "0", decimals);
    } catch {
      return 0n;
    }
  }, [amountInput, decimals]);

  const deadlineUnix = useMemo(() => {
    try {
      return isoToUnix(deadlineInput);
    } catch {
      return 0n;
    }
  }, [deadlineInput]);

  const needsApprove = allowance < amountWei;
  const canSubmit =
    onWirefluid &&
    !!connected &&
    player?.status === 2 &&
    !!chosenThreshold &&
    amountWei > 0n &&
    deadlineUnix > BigInt(Math.floor(Date.now() / 1000));

  const { writeContractAsync, data: lastHash, error: writeError, reset: resetWrite } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: lastHash, chainId: SCHOLARSHIP_CHAIN_ID });

  const [stepBusy, setStepBusy] = useState<string | null>(null);
  const [stepErr, setStepErr] = useState<string | null>(null);

  async function submitPledge() {
    if (!chosenThreshold) return;
    setStepErr(null);
    try {
      if (needsApprove) {
        setStepBusy(`Step 1/2 — approving ${amountInput} ${symbol}…`);
        await writeContractAsync({
          chainId: SCHOLARSHIP_CHAIN_ID,
          address: SCHOLARSHIP_CONTRACTS.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [SCHOLARSHIP_CONTRACTS.directSponsorship, amountWei],
        });
      }

      setStepBusy(`Step ${needsApprove ? "2/2" : "1/1"} — committing pledge…`);
      await writeContractAsync({
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.directSponsorship,
        abi: directSponsorshipAbi,
        functionName: "commit",
        args: [
          playerId,
          chosenThreshold.statKey,
          chosenThreshold.threshold,
          amountWei,
          deadlineUnix,
          messageInput,
        ],
      });

      // Reset the form back to defaults on success
      setMessageInput("");
      setAmountInput(DEFAULT_AMOUNT.toString());
      setDeadlineInput(defaultDeadline());
    } catch (e) {
      setStepErr((e as Error).message);
    } finally {
      setStepBusy(null);
    }
  }

  const commitments = commitmentsQ.data ?? [];
  const totalPledged = commitments.reduce<bigint>((s, c) => s + c.amount, 0n);

  return (
    <Card accent="#2563EB">
      <div className="wrap-on-mobile" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
        <div>
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: colors.textMuted,
              fontWeight: 600,
              marginBottom: "4px",
            }}
          >
            Player profile
          </div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: colors.textPrimary }}>
            {shortPlayerLabel(playerId)}
          </div>
          <div style={{ fontSize: "13px", color: colors.textSecondary, marginTop: "4px" }}>
            {player?.region || "—"} · Age {player?.age ?? "—"} · Registered{" "}
            {player?.registeredAt ? new Date(Number(player.registeredAt) * 1000).toLocaleDateString() : "—"}
          </div>
          <div style={{ fontSize: "12px", marginTop: "8px", color: colors.textMuted, display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <span>
              Wallet:{" "}
              {player?.wallet ? <AddressLink addr={player.wallet} short /> : "—"}
            </span>
            <span>
              Attestor:{" "}
              {player?.attestor ? <AddressLink addr={player.attestor} short /> : "—"}
            </span>
          </div>
        </div>
        <Pill
          text={STATUS_LABELS[player?.status ?? 0] ?? "Unknown"}
          tone={player?.status === 2 ? "success" : "muted"}
        />
      </div>

      {/* Existing sponsors */}
      <div style={{ marginTop: "20px" }}>
        <div
          style={{
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: colors.textMuted,
            fontWeight: 600,
            marginBottom: "10px",
          }}
        >
          Existing sponsors ({commitments.length})
          {commitments.length > 0 && (
            <span style={{ marginLeft: "12px", color: colors.textPrimary }}>
              · {formatUnits(totalPledged, decimals)} {symbol} pledged
            </span>
          )}
        </div>
        {commitments.length === 0 ? (
          <div
            style={{
              padding: "16px",
              background: colors.inputBg,
              border: `1px dashed ${colors.cardBorder}`,
              borderRadius: "8px",
              fontSize: "13px",
              color: colors.textMuted,
            }}
          >
            No sponsors yet. Be the first to back this player.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {commitments.map((c) => {
              const label = labelForStatKey(c.statKey);
              return (
                <div
                  key={c.id.toString()}
                  style={{
                    padding: "12px",
                    background: colors.inputBg,
                    border: `1px solid ${colors.cardBorder}`,
                    borderRadius: "8px",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "4px 16px",
                    alignItems: "start",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", color: colors.textPrimary, fontWeight: 600 }}>
                      {formatUnits(c.amount, decimals)} {symbol} if {label.label} ≥ {c.threshold.toString()}
                    </div>
                    {c.message && (
                      <div
                        style={{ fontSize: "12px", color: colors.textSecondary, marginTop: "4px", fontStyle: "italic" }}
                      >
                        “{c.message}”
                      </div>
                    )}
                    <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "4px" }}>
                      by <AddressLink addr={c.sponsor} short /> · expires {formatDate(c.deadline)}
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: colors.textMuted, fontFamily: "monospace" }}>
                    #{c.id.toString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Commit form */}
      <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${colors.cardBorder}` }}>
        <div
          style={{
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: colors.textMuted,
            fontWeight: 600,
            marginBottom: "12px",
          }}
        >
          Back this player
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: colors.textSecondary, display: "block", marginBottom: "4px" }}>
              Milestone
            </label>
            {thresholdsQ.data && thresholdsQ.data.length > 0 ? (
              <select
                value={statKey}
                onChange={(e) => setStatKey(e.target.value as Hex)}
                style={{ ...styles.input, padding: "8px 10px" }}
              >
                {thresholdsQ.data.map((t) => {
                  const lbl = labelForStatKey(t.statKey);
                  return (
                    <option key={t.statKey} value={t.statKey}>
                      {lbl.label} ≥ {t.threshold.toString()} {lbl.unit}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div style={{ fontSize: "13px", color: colors.textMuted, padding: "8px 0" }}>
                No milestones registered for this player yet.
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", color: colors.textSecondary, display: "block", marginBottom: "4px" }}>
                Amount ({symbol})
              </label>
              <input
                type="number"
                min={1}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                style={styles.input}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: colors.textSecondary, display: "block", marginBottom: "4px" }}>
                Deadline
              </label>
              <input
                type="datetime-local"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: colors.textSecondary, display: "block", marginBottom: "4px" }}>
              Message (optional)
            </label>
            <textarea
              rows={2}
              maxLength={140}
              placeholder="Go get 'em, champ."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              style={{ ...styles.input, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              paddingTop: "4px",
            }}
          >
            <div style={{ fontSize: "12px", color: colors.textMuted }}>
              {connected ? (
                <>
                  From <AddressLink addr={connected} short /> · Allowance{" "}
                  <strong style={{ color: colors.textPrimary }}>
                    {formatUnits(allowance, decimals)} {symbol}
                  </strong>
                </>
              ) : (
                "Connect a wallet to pledge."
              )}
            </div>
            <button
              style={styles.primaryButton}
              disabled={!canSubmit || !!stepBusy || receipt.isFetching}
              onClick={submitPledge}
              title={
                !onWirefluid
                  ? "Switch to WireFluid"
                  : !connected
                  ? "Connect wallet"
                  : player?.status !== 2
                  ? "Player not active"
                  : !chosenThreshold
                  ? "Select a milestone"
                  : amountWei === 0n
                  ? "Enter an amount"
                  : undefined
              }
            >
              {stepBusy ?? (needsApprove ? `Approve & pledge ${amountInput} ${symbol}` : `Pledge ${amountInput} ${symbol}`)}
            </button>
          </div>

          {(stepErr || writeError || lastHash) && (
            <div
              style={{
                marginTop: "4px",
                padding: "10px",
                background: stepErr || writeError ? colors.dangerBg : colors.infoBg,
                border: `1px solid ${stepErr || writeError ? colors.dangerBorder : colors.infoBorder}`,
                borderRadius: "6px",
                fontSize: "12px",
              }}
            >
              {stepErr || writeError ? (
                <span style={{ color: colors.dangerText }}>
                  Error: {stepErr ?? (writeError as Error)?.message}
                  <button
                    style={{ ...styles.button, marginLeft: "8px", padding: "2px 8px", fontSize: "11px" }}
                    onClick={() => {
                      setStepErr(null);
                      resetWrite();
                    }}
                  >
                    dismiss
                  </button>
                </span>
              ) : lastHash ? (
                <span style={{ color: colors.textPrimary }}>
                  {receipt.isSuccess ? "✓ Pledged — " : receipt.isFetching ? "Waiting for confirmation — " : "Pending — "}
                  <TxLink hash={lastHash} />
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SponsorPage() {
  const chainId = useChainId();
  const onWirefluid = chainId === SCHOLARSHIP_CHAIN_ID;
  const { switchChain, isPending: switchPending } = useSwitchChain();

  const playersQ = useAllPlayerIds();

  // Token metadata (decimals + symbol) shared by all tiles
  const meta = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.token,
        abi: erc20Abi,
        functionName: "decimals",
      },
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.token,
        abi: erc20Abi,
        functionName: "symbol",
      },
    ],
  });
  const decimals = (meta.data?.[0]?.result as number | undefined) ?? 18;
  const symbol = (meta.data?.[1]?.result as string | undefined) ?? "sUSD";

  const [selected, setSelected] = useState<Hex | null>(null);

  // Auto-select the first player if nothing is chosen and we have data
  React.useEffect(() => {
    if (!selected && playersQ.data && playersQ.data.length > 0) {
      setSelected(playersQ.data[0]);
    }
  }, [playersQ.data, selected]);

  return (
    <div>
      <div className="page-title" style={styles.pageTitle}>🤝 Sponsor a player</div>
      <div className="page-subtitle" style={styles.pageSubtitle}>
        Back a grassroots cricketer directly. Your pledge escrows on-chain and releases only when the DON oracle
        verifies the player hit their milestone — no committees, no claims adjusters.
      </div>

      {!onWirefluid && (
        <Card accent={colors.warningText}>
          <div className="wrap-on-mobile" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: "4px" }}>
                Switch to WireFluid testnet
              </div>
              <div style={{ fontSize: "13px", color: colors.textSecondary }}>
                Sponsorships settle on chain 92533. Your wallet is currently on chain {chainId}.
              </div>
            </div>
            <button
              style={styles.primaryButton}
              disabled={switchPending}
              onClick={() => switchChain({ chainId: SCHOLARSHIP_CHAIN_ID })}
            >
              {switchPending ? "Switching…" : "Switch network"}
            </button>
          </div>
        </Card>
      )}

      {/* Player grid */}
      <div
        style={{
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "1px",
          color: colors.textMuted,
          fontWeight: 600,
          marginBottom: "10px",
        }}
      >
        Registered players{playersQ.data ? ` (${playersQ.data.length})` : ""}
      </div>

      {playersQ.isLoading ? (
        <Card>Loading players…</Card>
      ) : playersQ.data && playersQ.data.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {playersQ.data.map((pid) => (
            <PlayerTile
              key={pid}
              playerId={pid}
              selected={selected === pid}
              onSelect={() => setSelected(pid)}
              decimals={decimals}
              symbol={symbol}
            />
          ))}
        </div>
      ) : (
        <Card>
          <div style={{ color: colors.textSecondary, fontSize: "14px" }}>
            No players registered yet. Register one via <code>PlayerRegistry.register()</code> (attestor-only).
          </div>
        </Card>
      )}

      {/* Detail panel */}
      {selected && <SelectedPlayerPanel playerId={selected} decimals={decimals} symbol={symbol} />}

      {/* Footer */}
      <Card title="How sponsorship settles">
        <ol
          style={{
            paddingLeft: "20px",
            margin: 0,
            fontSize: "13px",
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          <li>
            <strong style={{ color: colors.textPrimary }}>Pledge</strong> — you approve the DirectSponsorship contract
            and call <code>commit()</code>. Funds escrow in the contract.
          </li>
          <li>
            <strong style={{ color: colors.textPrimary }}>DON verifies</strong> — oracle nodes report match data. When
            the player crosses the threshold, <code>thresholdMet</code> becomes <code>true</code> on the feed.
          </li>
          <li>
            <strong style={{ color: colors.textPrimary }}>Anyone claims</strong> — a caller (often the player) triggers{" "}
            <code>DirectSponsorship.claim()</code>, and the escrow transfers to the player's registered wallet.
          </li>
          <li>
            <strong style={{ color: colors.textPrimary }}>Or you reclaim</strong> — if the deadline passes without a
            claim, only you (the sponsor) can pull your funds back via <code>reclaim()</code>.
          </li>
        </ol>
      </Card>

      <div style={{ height: "32px" }} />
    </div>
  );
}

export default SponsorPage;
