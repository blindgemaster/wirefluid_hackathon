import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { wirefluidTestnet } from "./wirefluid.js";

export const config = getDefaultConfig({
  appName: "Cricket Scholarship DAO",
  // Placeholder WalletConnect project id. Replace with your own from
  // https://cloud.reown.com if you want production-grade wallet support.
  projectId: "d1f5e3c8b7a04d2e9f6c1a3b5d8e7f90",
  chains: [wirefluidTestnet],
  ssr: false,
});
