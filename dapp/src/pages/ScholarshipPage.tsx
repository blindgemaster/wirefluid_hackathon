import React, { useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseUnits, type Hex } from "viem";
import { colors, styles } from "../theme.js";
import {
  SCHOLARSHIP_CHAIN_ID,
  SCHOLARSHIP_CONTRACTS,
  SEED_DEMO_RUNS,
  SEED_PLAYER_ID,
  SEED_PLAYER_LABEL,
  SEED_STAT_KEY,
  SEED_STAT_LABEL,
  SEED_THRESHOLD,
  WIREFLUID_EXPLORER,
} from "../scholarship.config.js";
import {
  erc20Abi,
  playerRegistryAbi,
  playerThresholdFeedWriteAbi,
  scholarshipVaultAbi,
} from "../abi/scholarship.js";
import { playerThresholdFeedAbi } from "../abi/playerThresholdFeed.js";

const STATUS_LABELS = ["None", "Pending", "Active", "Suspended"];

// Default funding for a new demo scholarship (matches DeployAll seed)
const DEFAULT_FUND_AMOUNT_HUMAN = 1_000n; // 1,000 sUSD

function Card({ title, children, accent, style }: { title?: string; children: React.ReactNode; accent?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        borderTop: accent ? `3px solid ${accent}` : undefined,
        marginBottom: "16px",
        ...style,
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

function ProgressBar({ value, threshold }: { value: bigint; threshold: bigint }) {
  const pct = threshold === 0n ? 0 : Math.min(100, Number((value * 100n) / threshold));
  const met = value >= threshold;
  return (
    <div style={{ marginTop: "8px" }}>
      <div
        style={{
          height: "12px",
          background: "#F1F5F9",
          borderRadius: "999px",
          overflow: "hidden",
          border: `1px solid ${colors.cardBorder}`,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: met
              ? "linear-gradient(90deg, #10B981, #059669)"
              : "linear-gradient(90deg, #3B82F6, #2563EB)",
            transition: "width 400ms ease",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: colors.textSecondary, marginTop: "4px" }}>
        <span>
          {value.toString()} / {threshold.toString()}
        </span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ScholarshipPage() {
  const chainId = useChainId();
  const onWirefluid = chainId === SCHOLARSHIP_CHAIN_ID;
  const { switchChain, isPending: switchPending } = useSwitchChain();
  const { address: connected } = useAccount();

  // Discover the latest scholarship id by reading nextScholarshipId.
  // Vault assigns id = ++nextScholarshipId, so the most recent id == nextScholarshipId.
  const idRead = useReadContract({
    chainId: SCHOLARSHIP_CHAIN_ID,
    address: SCHOLARSHIP_CONTRACTS.scholarshipVault,
    abi: scholarshipVaultAbi,
    functionName: "nextScholarshipId",
    query: { refetchInterval: 4_000 },
  });
  const nextId = (idRead.data as bigint | undefined) ?? 0n;
  // Fall back to id 1 if the vault is empty so the UI doesn't crash on first load.
  const activeScholarshipId = nextId > 0n ? nextId : 1n;

  // Read all the state we need in one round-trip
  const reads = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.playerRegistry,
        abi: playerRegistryAbi,
        functionName: "getPlayer",
        args: [SEED_PLAYER_ID],
      },
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.playerThresholdFeed,
        abi: playerThresholdFeedAbi,
        functionName: "getStat",
        args: [SEED_PLAYER_ID, SEED_STAT_KEY],
      },
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.playerThresholdFeed,
        abi: playerThresholdFeedAbi,
        functionName: "getThreshold",
        args: [SEED_PLAYER_ID, SEED_STAT_KEY],
      },
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.scholarshipVault,
        abi: scholarshipVaultAbi,
        functionName: "scholarships",
        args: [activeScholarshipId],
      },
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.scholarshipVault,
        abi: scholarshipVaultAbi,
        functionName: "isClaimable",
        args: [activeScholarshipId],
      },
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.token,
        abi: erc20Abi,
        functionName: "symbol",
      },
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.token,
        abi: erc20Abi,
        functionName: "decimals",
      },
      {
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.playerThresholdFeed,
        abi: playerThresholdFeedWriteAbi,
        functionName: "aggregator",
      },
    ],
    query: { refetchInterval: 4_000 }, // fast enough for WireFluid's ~5s blocks
  });

  const playerRes = reads.data?.[0];
  const statRes = reads.data?.[1];
  const thresholdRes = reads.data?.[2];
  const schRes = reads.data?.[3];
  const claimableRes = reads.data?.[4];
  const symbolRes = reads.data?.[5];
  const decimalsRes = reads.data?.[6];
  const aggregatorRes = reads.data?.[7];

  const player = playerRes?.result as
    | {
        playerId: Hex;
        wallet: Hex;
        attestor: Hex;
        age: number;
        region: string;
        status: number;
        registeredAt: bigint;
      }
    | undefined;

  const stat = statRes?.result as [bigint, boolean, bigint] | undefined;
  const threshold = thresholdRes?.result as [bigint, boolean] | undefined;
  const scholarship = schRes?.result as
    | readonly [Hex, Hex, bigint, bigint, Hex, boolean, boolean, bigint]
    | undefined;
  const claimable = claimableRes?.result as boolean | undefined;
  const symbol = (symbolRes?.result as string | undefined) ?? "sUSD";
  const decimals = (decimalsRes?.result as number | undefined) ?? 18;
  const aggregator = aggregatorRes?.result as Hex | undefined;

  const tokenPayout = useReadContract({
    chainId: SCHOLARSHIP_CHAIN_ID,
    address: SCHOLARSHIP_CONTRACTS.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: player?.wallet ? [player.wallet] : undefined,
    query: { enabled: !!player?.wallet, refetchInterval: 4_000 },
  });
  const playerBalance = tokenPayout.data as bigint | undefined;

  // Connected wallet's allowance to the vault (so we know if approve is needed)
  const allowanceRead = useReadContract({
    chainId: SCHOLARSHIP_CHAIN_ID,
    address: SCHOLARSHIP_CONTRACTS.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: connected ? [connected, SCHOLARSHIP_CONTRACTS.scholarshipVault] : undefined,
    query: { enabled: !!connected, refetchInterval: 4_000 },
  });
  const allowance = (allowanceRead.data as bigint | undefined) ?? 0n;

  // --- Write actions ---
  const { writeContract, writeContractAsync, data: pendingHash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash, chainId: SCHOLARSHIP_CHAIN_ID });

  const isAggregator = !!connected && !!aggregator && connected.toLowerCase() === aggregator.toLowerCase();

  const [runsInput, setRunsInput] = useState<string>(SEED_DEMO_RUNS.toString());
  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  const [demoErr, setDemoErr] = useState<string | null>(null);

  const fundAmountWei = useMemo(
    () => parseUnits(DEFAULT_FUND_AMOUNT_HUMAN.toString(), decimals),
    [decimals],
  );
  const needsApprove = allowance < fundAmountWei;

  function pushStat() {
    const v = BigInt(runsInput || "0");
    writeContract({
      chainId: SCHOLARSHIP_CHAIN_ID,
      address: SCHOLARSHIP_CONTRACTS.playerThresholdFeed,
      abi: playerThresholdFeedWriteAbi,
      functionName: "pushStat",
      args: [SEED_PLAYER_ID, SEED_STAT_KEY, v],
    });
  }

  function claimScholarship() {
    writeContract({
      chainId: SCHOLARSHIP_CHAIN_ID,
      address: SCHOLARSHIP_CONTRACTS.scholarshipVault,
      abi: scholarshipVaultAbi,
      functionName: "claim",
      args: [activeScholarshipId],
    });
  }

  async function resetStat() {
    setDemoErr(null);
    setDemoBusy("Resetting stat to 0…");
    try {
      await writeContractAsync({
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.playerThresholdFeed,
        abi: playerThresholdFeedWriteAbi,
        functionName: "pushStat",
        args: [SEED_PLAYER_ID, SEED_STAT_KEY, 0n],
      });
    } catch (e) {
      setDemoErr((e as Error).message);
    } finally {
      setDemoBusy(null);
    }
  }

  async function approveSpend() {
    setDemoErr(null);
    setDemoBusy(`Approving ${DEFAULT_FUND_AMOUNT_HUMAN.toString()} ${symbol}…`);
    try {
      await writeContractAsync({
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [SCHOLARSHIP_CONTRACTS.scholarshipVault, fundAmountWei],
      });
    } catch (e) {
      setDemoErr((e as Error).message);
    } finally {
      setDemoBusy(null);
    }
  }

  async function openNewScholarship() {
    setDemoErr(null);
    setDemoBusy(`Opening new scholarship for ${DEFAULT_FUND_AMOUNT_HUMAN.toString()} ${symbol}…`);
    try {
      await writeContractAsync({
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.scholarshipVault,
        abi: scholarshipVaultAbi,
        functionName: "createScholarship",
        args: [SEED_PLAYER_ID, SEED_STAT_KEY, SEED_THRESHOLD, fundAmountWei],
      });
    } catch (e) {
      setDemoErr((e as Error).message);
    } finally {
      setDemoBusy(null);
    }
  }

  /// One-click clean-slate: reset stat → approve (if needed) → open new scholarship.
  /// Each step is its own MetaMask popup so the user can see what's happening.
  async function resetAndOpenNew() {
    setDemoErr(null);
    try {
      setDemoBusy("Step 1/3 — resetting stat to 0…");
      await writeContractAsync({
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.playerThresholdFeed,
        abi: playerThresholdFeedWriteAbi,
        functionName: "pushStat",
        args: [SEED_PLAYER_ID, SEED_STAT_KEY, 0n],
      });

      if (needsApprove) {
        setDemoBusy(`Step 2/3 — approving ${DEFAULT_FUND_AMOUNT_HUMAN.toString()} ${symbol}…`);
        await writeContractAsync({
          chainId: SCHOLARSHIP_CHAIN_ID,
          address: SCHOLARSHIP_CONTRACTS.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [SCHOLARSHIP_CONTRACTS.scholarshipVault, fundAmountWei],
        });
      }

      setDemoBusy(`Step ${needsApprove ? "3/3" : "2/2"} — opening new scholarship…`);
      await writeContractAsync({
        chainId: SCHOLARSHIP_CHAIN_ID,
        address: SCHOLARSHIP_CONTRACTS.scholarshipVault,
        abi: scholarshipVaultAbi,
        functionName: "createScholarship",
        args: [SEED_PLAYER_ID, SEED_STAT_KEY, SEED_THRESHOLD, fundAmountWei],
      });

      setDemoBusy(null);
    } catch (e) {
      setDemoErr((e as Error).message);
      setDemoBusy(null);
    }
  }

  const schAmount = scholarship?.[3] ?? 0n;
  const schClaimed = scholarship?.[5] ?? false;
  const schCancelled = scholarship?.[6] ?? false;

  const matchStatus = useMemo(() => {
    if (!stat) return { label: "No stat pushed yet", tone: "muted" as const };
    if (stat[1]) return { label: `Threshold met at ${stat[0]} runs`, tone: "success" as const };
    return { label: `Current: ${stat[0]} runs (threshold ${threshold?.[0] ?? 0n})`, tone: "info" as const };
  }, [stat, threshold]);

  const writeBusy = isPending || receipt.isFetching || !!demoBusy;

  return (
    <div>
      {/* Hero */}
      <div style={styles.pageTitle}>🏏 Cricket Scholarship DAO</div>
      <div style={styles.pageSubtitle}>
        Oracle-gated scholarships for grassroots players. Live on WireFluid testnet (chain 92533).
        DON nodes attest performance → the vault releases tokens automatically when thresholds are crossed.
      </div>

      {/* Chain banner */}
      {!onWirefluid && (
        <Card accent={colors.warningText}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: "4px" }}>
                Switch to WireFluid testnet
              </div>
              <div style={{ fontSize: "13px", color: colors.textSecondary }}>
                The scholarship contracts live on chain 92533. Your wallet is currently on chain {chainId}.
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

      {/* Demo controls — only shown to the aggregator wallet (the demo driver) */}
      {onWirefluid && isAggregator && (
        <Card accent="#F59E0B">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "250px" }}>
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
                Demo controls
              </div>
              <div style={{ fontSize: "13px", color: colors.textSecondary, lineHeight: 1.5 }}>
                Reset on-chain state to a clean slate before recording. The active scholarship below auto-updates
                to whichever id the vault returned last.
              </div>
              <div style={{ marginTop: "8px", fontSize: "12px", color: colors.textMuted }}>
                Active scholarship id:{" "}
                <strong style={{ color: colors.textPrimary }}>#{activeScholarshipId.toString()}</strong>
                {" · "}Allowance:{" "}
                <strong style={{ color: colors.textPrimary }}>
                  {formatUnits(allowance, decimals)} {symbol}
                </strong>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }}>
              <button
                style={styles.button}
                disabled={writeBusy}
                onClick={resetStat}
                title="pushStat(playerId, statKey, 0)"
              >
                Reset stat → 0
              </button>
              <button
                style={styles.button}
                disabled={writeBusy || !needsApprove}
                onClick={approveSpend}
                title={needsApprove ? "Approve 1000 sUSD to the vault" : "Allowance already sufficient"}
              >
                {needsApprove ? `Approve ${DEFAULT_FUND_AMOUNT_HUMAN.toString()} ${symbol}` : "Approved ✓"}
              </button>
              <button
                style={styles.button}
                disabled={writeBusy}
                onClick={openNewScholarship}
                title="vault.createScholarship(...)"
              >
                Open new scholarship
              </button>
              <button
                style={styles.primaryButton}
                disabled={writeBusy}
                onClick={resetAndOpenNew}
                title="Runs: reset stat → (maybe approve) → createScholarship"
              >
                {demoBusy ?? "🔄 Reset & open new"}
              </button>
            </div>
          </div>
          {demoErr && (
            <div
              style={{
                marginTop: "12px",
                padding: "10px",
                background: colors.dangerBg,
                border: `1px solid ${colors.dangerBorder}`,
                color: colors.dangerText,
                borderRadius: "6px",
                fontSize: "12px",
              }}
            >
              {demoErr}
              <button
                style={{ ...styles.button, marginLeft: "8px", padding: "2px 8px", fontSize: "11px" }}
                onClick={() => setDemoErr(null)}
              >
                dismiss
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Player card */}
        <Card title="Player" accent="#2563EB" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: colors.textPrimary }}>{SEED_PLAYER_LABEL}</div>
              <div style={{ fontSize: "13px", color: colors.textSecondary, marginTop: "2px" }}>
                {player?.region ?? "—"} · Age {player?.age ?? "—"}
              </div>
            </div>
            <Pill
              text={STATUS_LABELS[player?.status ?? 0] ?? "Unknown"}
              tone={player?.status === 2 ? "success" : "muted"}
            />
          </div>

          <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: "13px" }}>
            <span style={{ color: colors.textMuted }}>Wallet</span>
            {player?.wallet ? <AddressLink addr={player.wallet} short /> : <span>—</span>}
            <span style={{ color: colors.textMuted }}>Attestor</span>
            {player?.attestor ? <AddressLink addr={player.attestor} short /> : <span>—</span>}
            <span style={{ color: colors.textMuted }}>playerId</span>
            <span style={{ fontFamily: "monospace", fontSize: "11px", color: colors.textSecondary }}>
              {SEED_PLAYER_ID.slice(0, 10)}…{SEED_PLAYER_ID.slice(-6)}
            </span>
            <span style={{ color: colors.textMuted }}>Payout balance</span>
            <span style={{ fontFamily: "monospace", fontSize: "13px", color: colors.textPrimary }}>
              {playerBalance !== undefined ? formatUnits(playerBalance, decimals) : "—"} {symbol}
            </span>
          </div>
        </Card>

        {/* Scholarship card */}
        <Card title={`Scholarship #${activeScholarshipId.toString()}`} accent="#10B981" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "32px", fontWeight: 800, color: colors.textPrimary, letterSpacing: "-1px" }}>
              {formatUnits(schAmount, decimals)}
            </span>
            <span style={{ fontSize: "14px", color: colors.textSecondary, fontWeight: 600 }}>{symbol}</span>
          </div>

          <div style={{ marginTop: "6px", fontSize: "13px", color: colors.textSecondary }}>
            Releases when <code style={{ color: colors.textPrimary, fontSize: "12px" }}>{SEED_STAT_LABEL}</code> ≥{" "}
            <strong>{SEED_THRESHOLD.toString()}</strong>
          </div>

          <div style={{ marginTop: "16px" }}>
            <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "6px", fontWeight: 600 }}>
              PROGRESS
            </div>
            <ProgressBar value={stat?.[0] ?? 0n} threshold={threshold?.[0] ?? SEED_THRESHOLD} />
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {schClaimed && <Pill text="Claimed ✓" tone="success" />}
            {schCancelled && <Pill text="Cancelled" tone="danger" />}
            {!schClaimed && !schCancelled && claimable && <Pill text="Ready to claim" tone="success" />}
            {!schClaimed && !schCancelled && !claimable && <Pill text="Awaiting threshold" tone="info" />}
          </div>
        </Card>
      </div>

      {/* Demo actions */}
      <div style={{ height: "16px" }} />
      <Card accent="#7C3AED">
        <div
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: colors.textMuted,
            fontWeight: 600,
            marginBottom: "8px",
          }}
        >
          Live demo — requires WireFluid connection
        </div>
        <div style={{ fontSize: "14px", color: colors.textPrimary, lineHeight: 1.5, marginBottom: "16px" }}>
          Simulate a DON aggregator pushing a match-day stat, then trigger the scholarship payout. Both
          transactions finalise in ~5 seconds thanks to CometBFT. Any claim is permissionless — anyone
          with gas can call <code>claim()</code> once the threshold is met.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* 1. Push stat */}
          <div style={{ padding: "16px", border: `1px solid ${colors.cardBorder}`, borderRadius: "8px", background: colors.inputBg }}>
            <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: "4px" }}>1. Push match-day stat</div>
            <div style={{ fontSize: "12px", color: colors.textSecondary, marginBottom: "12px" }}>
              Only the DON aggregator EOA can call <code>pushStat</code>. On the current deployment
              that's the deployer wallet — connect as that wallet to drive the demo.
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                value={runsInput}
                onChange={(e) => setRunsInput(e.target.value)}
                style={{ ...styles.input, maxWidth: "100px" }}
                disabled={!onWirefluid || writeBusy}
              />
              <span style={{ fontSize: "12px", color: colors.textSecondary }}>runs</span>
              <button
                style={styles.primaryButton}
                onClick={pushStat}
                disabled={!onWirefluid || !isAggregator || writeBusy}
                title={
                  !onWirefluid
                    ? "Connect to WireFluid"
                    : !isAggregator
                    ? `Need aggregator wallet ${aggregator?.slice(0, 8)}…`
                    : undefined
                }
              >
                Push stat
              </button>
            </div>
            {!isAggregator && connected && onWirefluid && aggregator && (
              <div style={{ marginTop: "8px", fontSize: "11px", color: colors.textMuted }}>
                Connected wallet is not the configured aggregator (
                <AddressLink addr={aggregator} short />). The DON Aggregator contract would sign
                this in production.
              </div>
            )}
          </div>

          {/* 2. Claim */}
          <div style={{ padding: "16px", border: `1px solid ${colors.cardBorder}`, borderRadius: "8px", background: colors.inputBg }}>
            <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: "4px" }}>2. Claim the scholarship</div>
            <div style={{ fontSize: "12px", color: colors.textSecondary, marginBottom: "12px" }}>
              Anyone with gas can trigger the payout to the player's registered wallet.
            </div>
            <button
              style={styles.primaryButton}
              onClick={claimScholarship}
              disabled={!onWirefluid || !claimable || writeBusy}
            >
              {schClaimed
                ? "Already claimed"
                : claimable
                ? `Claim ${formatUnits(schAmount, decimals)} ${symbol}`
                : "Threshold not yet met"}
            </button>
          </div>
        </div>

        {/* Tx status */}
        {(pendingHash || writeError || demoBusy) && (
          <div style={{ marginTop: "16px", padding: "12px", borderRadius: "8px", background: writeError ? colors.dangerBg : colors.infoBg, border: `1px solid ${writeError ? colors.dangerBorder : colors.infoBorder}` }}>
            {writeError ? (
              <div style={{ color: colors.dangerText, fontSize: "13px" }}>
                Error: {(writeError as Error).message}
                <button
                  style={{ ...styles.button, marginLeft: "8px", padding: "2px 8px", fontSize: "11px" }}
                  onClick={() => resetWrite()}
                >
                  dismiss
                </button>
              </div>
            ) : demoBusy ? (
              <div style={{ fontSize: "13px", color: colors.textPrimary }}>{demoBusy}</div>
            ) : (
              <div style={{ fontSize: "13px", color: colors.textPrimary }}>
                {receipt.isSuccess ? "✓ Confirmed — " : receipt.isFetching ? "Waiting for confirmation — " : "Pending — "}
                {pendingHash && <TxLink hash={pendingHash} />}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: "16px", fontSize: "12px", color: colors.textMuted }}>
          Match status: {matchStatus.label}
        </div>
      </Card>

      {/* Contracts footer */}
      <Card title="Deployed contracts (WireFluid testnet)">
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: "12px" }}>
          {Object.entries(SCHOLARSHIP_CONTRACTS).map(([k, v]) => (
            <React.Fragment key={k}>
              <span style={{ color: colors.textMuted }}>{k}</span>
              <AddressLink addr={v} />
            </React.Fragment>
          ))}
        </div>
        <div style={{ marginTop: "12px", fontSize: "11px", color: colors.textMuted }}>
          Auto-refresh every 4s. Source of truth:{" "}
          <a
            href={`${WIREFLUID_EXPLORER}/address/${SCHOLARSHIP_CONTRACTS.scholarshipVault}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: colors.textLink }}
          >
            wirefluidscan.com
          </a>
        </div>
      </Card>

      <div style={{ height: "32px" }} />
    </div>
  );
}

export default ScholarshipPage;
