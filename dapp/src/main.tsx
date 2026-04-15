import React from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { config } from "./wagmi.js";
import { Shell } from "./components/Shell.js";
import { ScholarshipPage } from "./pages/ScholarshipPage.js";
import { SponsorPage } from "./pages/SponsorPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";

import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <ScholarshipPage /> },
      { path: "/sponsor", element: <SponsorPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({ accentColor: "#2563EB", borderRadius: "small" })}
        >
          <RouterProvider router={router} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
