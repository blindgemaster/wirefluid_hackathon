import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { colors } from "../theme.js";

const links = [
  { to: "/", name: "Scholarship DAO" },
  { to: "/sponsor", name: "Sponsor a Player" },
  { to: "/register", name: "Register a Player" },
];

const linkStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "8px",
  textDecoration: "none",
  color: colors.textSecondary,
  fontSize: "14px",
  fontWeight: 500,
  transition: "background 0.15s",
};

const activeStyle: React.CSSProperties = {
  ...linkStyle,
  background: colors.infoBg,
  color: colors.accent,
  fontWeight: 600,
};

export function Shell() {
  return (
    <div style={{ minHeight: "100vh", background: colors.pageBg }}>
      <header
        className="app-header"
        style={{
          background: colors.headerBg,
          borderBottom: `1px solid ${colors.cardBorder}`,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          className="app-header-left"
          style={{ display: "flex", alignItems: "center", gap: "20px", flex: 1, minWidth: 0, flexWrap: "wrap" }}
        >
          <span
            className="app-header-brand"
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: colors.accent,
              letterSpacing: "-0.5px",
              whiteSpace: "nowrap",
            }}
          >
            🏏 Cricket Scholarship DAO
          </span>
          <nav className="app-header-nav" style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                style={({ isActive }) => (isActive ? activeStyle : linkStyle)}
              >
                {l.name}
              </NavLink>
            ))}
          </nav>
        </div>
        <ConnectButton
          showBalance={{ smallScreen: false, largeScreen: true }}
          chainStatus={{ smallScreen: "icon", largeScreen: "full" }}
          accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
        />
      </header>
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px" }}>
        <Outlet />
      </main>
      <footer
        style={{
          textAlign: "center",
          padding: "24px 16px 32px",
          color: colors.textMuted,
          fontSize: "12px",
        }}
      >
        Built for the ICC Next In 2.0 hackathon · Live on{" "}
        <a
          href="https://wirefluidscan.com"
          target="_blank"
          rel="noreferrer"
          style={{ color: colors.textLink }}
        >
          WireFluid testnet (chain 92533)
        </a>
      </footer>
    </div>
  );
}
