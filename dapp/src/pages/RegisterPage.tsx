import React, { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { keccak256, stringToHex, type Hex, isAddress } from "viem";
import { colors, styles } from "../theme.js";
import {
  SCHOLARSHIP_CHAIN_ID,
  SCHOLARSHIP_CONTRACTS,
  WIREFLUID_EXPLORER,
} from "../scholarship.config.js";
import { playerRegistryAbi } from "../abi/scholarship.js";
import { saveLabel } from "../labelCache.js";

/**
 * Public player registration form.
 *
 * The on-chain `PlayerRegistry.register()` is gated to a whitelist of
 * attestor addresses. Instead of exposing that key to every visitor, we send
 * the form to a Vercel serverless function (`/api/register`) that holds the
 * attestor key and submits the transaction on the user's behalf. Result:
 * user pays zero gas, has no wallet-interaction friction, but the on-chain
 * attestation trail still shows the verified attestor address.
 */

function Card({
  title,
  children,
  accent,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  accent?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: "12px",
        padding: "24px",
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
            marginBottom: "16px",
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: colors.textPrimary,
          display: "block",
          marginBottom: "4px",
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: "11px", color: colors.textMuted, marginTop: "4px" }}>{hint}</div>
      )}
    </div>
  );
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface MilestoneReceipt {
  statLabel: string;
  threshold: string;
  display: string;
  txHash?: string;
}

type State =
  | { status: "idle" }
  | { status: "submitting"; step: string }
  | {
      status: "success";
      txHash: Hex;
      playerId: Hex;
      label: string;
      milestones: MilestoneReceipt[];
    }
  | { status: "error"; message: string };

export function RegisterPage() {
  const { address: connected } = useAccount();

  // Form state
  const [label, setLabel] = useState("");
  const [wallet, setWallet] = useState("");
  const [age, setAge] = useState("17");
  const [region, setRegion] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [useConnectedWallet, setUseConnectedWallet] = useState(true);

  const effectiveWallet = useConnectedWallet && connected ? connected : wallet;
  const playerId = useMemo<Hex | null>(() => {
    const slug = slugify(label);
    if (slug.length < 3) return null;
    return keccak256(stringToHex(slug));
  }, [label]);

  // Check whether this playerId already exists
  const existing = useReadContract({
    chainId: SCHOLARSHIP_CHAIN_ID,
    address: SCHOLARSHIP_CONTRACTS.playerRegistry,
    abi: playerRegistryAbi,
    functionName: "getPlayer",
    args: playerId ? [playerId] : undefined,
    query: { enabled: !!playerId },
  });
  const existingStatus = (existing.data as any)?.status as number | undefined;
  const alreadyRegistered = existingStatus !== undefined && existingStatus !== 0;

  const errors: string[] = [];
  if (label && slugify(label).length < 3) errors.push("Label too short after normalisation.");
  if (wallet && !useConnectedWallet && !isAddress(wallet)) errors.push("Wallet address invalid.");
  if (age && (!/^\d+$/.test(age) || +age < 6 || +age > 25)) errors.push("Age must be between 6 and 25.");
  if (region && region.trim().length < 2) errors.push("Region too short.");

  const canSubmit =
    state.status !== "submitting" &&
    playerId !== null &&
    !alreadyRegistered &&
    !!effectiveWallet &&
    isAddress(effectiveWallet) &&
    age !== "" &&
    region.trim().length >= 2 &&
    errors.length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !playerId) return;

    setState({ status: "submitting", step: "submitting to registrar…" });
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: slugify(label),
          wallet: effectiveWallet,
          age: Number(age),
          region: region.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      // Cache the human label so the /sponsor page shows it instead of the
      // truncated keccak hash the next time we render.
      saveLabel(json.playerId as Hex, slugify(label));

      setState({
        status: "success",
        txHash: json.txHash as Hex,
        playerId: json.playerId as Hex,
        label: slugify(label),
        milestones: Array.isArray(json.milestones) ? (json.milestones as MilestoneReceipt[]) : [],
      });
      // Clear form so the user can add another
      setLabel("");
      setRegion("");
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <div>
      <div className="page-title" style={styles.pageTitle}>📝 Register a player</div>
      <div className="page-subtitle" style={styles.pageSubtitle}>
        Add a grassroots cricketer to the DAO registry. Registration is gasless — a trusted attestor
        signs the transaction on the player's behalf. After registration, DAO members fund scholarships
        and sponsors commit pledges against the player's performance milestones.
      </div>

      <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: "16px" }}>
        <Card accent="#2563EB" style={{ marginBottom: 0 }}>
          <form onSubmit={submit} style={{ display: "grid", gap: "14px" }}>
            <Field
              label="Player label"
              hint='A unique identifier. Becomes keccak256("SLUG") on-chain. Example: "PAK-KPK-U17-KHAN-042"'
            >
              <input
                type="text"
                placeholder="PAK-KPK-U17-KHAN-042"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                style={styles.input}
                maxLength={80}
                required
              />
              {playerId && (
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "11px",
                    color: alreadyRegistered ? colors.dangerText : colors.textMuted,
                    fontFamily: "monospace",
                  }}
                >
                  playerId = {playerId}
                  {alreadyRegistered && " — already registered ✗"}
                </div>
              )}
            </Field>

            <Field label="Payout wallet" hint="Where scholarship funds land when thresholds are met.">
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: colors.textSecondary,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useConnectedWallet}
                    onChange={(e) => setUseConnectedWallet(e.target.checked)}
                  />
                  Use my connected wallet {connected ? `(${connected.slice(0, 8)}…${connected.slice(-4)})` : "(none connected yet)"}
                </label>
                <input
                  type="text"
                  placeholder="0x…"
                  value={useConnectedWallet && connected ? connected : wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  disabled={useConnectedWallet && !!connected}
                  style={{ ...styles.input, fontFamily: "monospace", fontSize: "12px" }}
                />
              </div>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
              <Field label="Age" hint="6 to 25">
                <input
                  type="number"
                  min={6}
                  max={25}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  style={styles.input}
                  required
                />
              </Field>
              <Field label="Region" hint='e.g. "PAK-KPK", "IND-MUM", "BGD-DHK"'>
                <input
                  type="text"
                  placeholder="PAK-KPK"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  style={styles.input}
                  maxLength={40}
                  required
                />
              </Field>
            </div>

            {errors.length > 0 && (
              <div
                style={{
                  background: colors.dangerBg,
                  border: `1px solid ${colors.dangerBorder}`,
                  color: colors.dangerText,
                  padding: "10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              >
                {errors.join(" ")}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="submit"
                style={styles.primaryButton}
                disabled={!canSubmit}
                title={alreadyRegistered ? "Player already on-chain" : undefined}
              >
                {state.status === "submitting" ? state.step : "Register player"}
              </button>
              <span style={{ fontSize: "12px", color: colors.textMuted }}>
                Submitted via trusted attestor · no gas fee for you
              </span>
            </div>

            {state.status === "success" && (
              <div
                style={{
                  background: colors.successBg,
                  border: `1px solid ${colors.successBorder}`,
                  color: colors.successText,
                  padding: "14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                ✓ <strong>{state.label}</strong> is now registered and active.
                <div style={{ marginTop: "6px", fontSize: "11px", color: colors.textSecondary, fontFamily: "monospace" }}>
                  playerId: {state.playerId}
                </div>
                <div style={{ marginTop: "4px", fontSize: "12px" }}>
                  Tx:{" "}
                  <a
                    href={`${WIREFLUID_EXPLORER}/tx/${state.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: colors.textLink, fontFamily: "monospace" }}
                  >
                    {state.txHash.slice(0, 10)}…{state.txHash.slice(-8)} ↗
                  </a>
                </div>
                {state.milestones.length > 0 && (
                  <div style={{ marginTop: "10px", fontSize: "12px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                      Milestones registered (player is now sponsorable):
                    </div>
                    <ul style={{ paddingLeft: "18px", marginTop: "2px" }}>
                      {state.milestones.map((m) => (
                        <li key={m.statLabel} style={{ marginBottom: "2px" }}>
                          {m.display}
                          {m.txHash ? (
                            <>
                              {" · "}
                              <a
                                href={`${WIREFLUID_EXPLORER}/tx/${m.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: colors.textLink, fontFamily: "monospace", fontSize: "11px" }}
                              >
                                tx ↗
                              </a>
                            </>
                          ) : (
                            <span style={{ color: colors.textMuted, fontSize: "11px" }}> · already on-chain</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div style={{ marginTop: "10px", fontSize: "12px" }}>
                  Head to the{" "}
                  <a href="/sponsor" style={{ color: colors.textLink, fontWeight: 600 }}>
                    Sponsor a Player
                  </a>{" "}
                  page to back this player.
                </div>
              </div>
            )}

            {state.status === "error" && (
              <div
                style={{
                  background: colors.dangerBg,
                  border: `1px solid ${colors.dangerBorder}`,
                  color: colors.dangerText,
                  padding: "14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                ✗ {state.message}
                <button
                  style={{ ...styles.button, marginLeft: "8px", padding: "2px 8px", fontSize: "11px" }}
                  onClick={() => setState({ status: "idle" })}
                >
                  dismiss
                </button>
              </div>
            )}
          </form>
        </Card>

        <Card accent="#10B981" style={{ marginBottom: 0 }}>
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
            What happens next?
          </div>
          <ol style={{ paddingLeft: "18px", fontSize: "13px", color: colors.textSecondary, lineHeight: 1.6 }}>
            <li>
              A trusted attestor signs <code>register()</code> for you — no MetaMask popup,
              no gas from your side.
            </li>
            <li>
              The DAO treasury or individual sponsors fund scholarships tied to performance
              milestones (e.g. "score 50 runs in an innings").
            </li>
            <li>
              DON oracle nodes observe real match data. When the player crosses the threshold,
              the scholarship auto-releases to the payout wallet — no committee approval, no delay.
            </li>
          </ol>
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              background: colors.inputBg,
              border: `1px dashed ${colors.cardBorder}`,
              borderRadius: "6px",
              fontSize: "11px",
              color: colors.textMuted,
            }}
          >
            ⚠️ Testnet demo. Anyone can register any player — in production, attestor role
            would be bonded to regional federations with economic stake.
          </div>
        </Card>
      </div>
    </div>
  );
}

export default RegisterPage;
