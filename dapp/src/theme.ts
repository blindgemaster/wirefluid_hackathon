/** DON Portal Light Theme — Slate palette */

export const colors = {
  // Backgrounds
  pageBg: "#FAFBFC",
  cardBg: "#FFFFFF",
  sidebarBg: "#F1F5F9",
  headerBg: "#FFFFFF",
  inputBg: "#F8FAFC",
  hoverBg: "#F0F5FF",

  // Borders
  cardBorder: "#E5E7EB",
  sidebarBorder: "#E2E8F0",
  inputBorder: "#CBD5E1",
  divider: "#F1F5F9",

  // Text
  textPrimary: "#1E293B",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  textLink: "#2563EB",

  // Accent
  accent: "#2563EB",
  accentHover: "#1D4ED8",

  // Status
  successBg: "#ECFDF5",
  successText: "#059669",
  successBorder: "#A7F3D0",
  dangerBg: "#FEF2F2",
  dangerText: "#DC2626",
  dangerBorder: "#FECACA",
  warningBg: "#FFFBEB",
  warningText: "#D97706",
  warningBorder: "#FDE68A",
  infoBg: "#EFF6FF",
  infoText: "#2563EB",
  infoBorder: "#BFDBFE",
} as const;

export const styles = {
  input: {
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
    borderRadius: "6px",
    padding: "8px 12px",
    color: colors.textPrimary,
    fontSize: "13px",
    width: "100%",
    outline: "none",
  } as React.CSSProperties,

  button: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: `1px solid ${colors.inputBorder}`,
    background: colors.cardBg,
    color: colors.textPrimary,
    fontSize: "13px",
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,

  primaryButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: `1px solid ${colors.accent}`,
    background: colors.accent,
    color: "#FFFFFF",
    fontSize: "13px",
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,

  dangerButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: `1px solid ${colors.dangerBorder}`,
    background: colors.dangerBg,
    color: colors.dangerText,
    fontSize: "13px",
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,

  successButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: `1px solid ${colors.successBorder}`,
    background: colors.successBg,
    color: colors.successText,
    fontSize: "13px",
    cursor: "pointer",
    fontWeight: 500,
  } as React.CSSProperties,

  pageTitle: {
    fontSize: "24px",
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: "4px",
  } as React.CSSProperties,

  pageSubtitle: {
    color: colors.textSecondary,
    fontSize: "14px",
    marginBottom: "20px",
  } as React.CSSProperties,
} as const;

import type React from "react";
