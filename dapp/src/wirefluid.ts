import { defineChain } from "viem";

/**
 * WireFluid testnet chain definition for wagmi.
 *
 * CometBFT-EVM hybrid L1 used by the ICC Next In 2.0 hackathon
 * Cricket Scholarship DAO demo. ~5s finality, stable fees.
 */
export const wirefluidTestnet = defineChain({
  id: 92533,
  name: "WireFluid Testnet",
  nativeCurrency: { name: "WireFluid", symbol: "WIRE", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://evm.wirefluid.com",
        "https://evm2.wirefluid.com",
        "https://evm3.wirefluid.com",
      ],
      webSocket: ["wss://ws.wirefluid.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "WireFluidScan",
      url: "https://wirefluidscan.com",
    },
  },
  testnet: true,
});
