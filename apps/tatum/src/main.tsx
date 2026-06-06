import "@rainbow-me/rainbowkit/styles.css";
import "@mysten/dapp-kit/dist/index.css";

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { WagmiProvider, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

import App from "./App";

import "./styles.css";

const queryClient = new QueryClient();
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";
const wagmiConfig = getDefaultConfig({
  appName: "Floe",
  projectId: walletConnectProjectId,
  chains: [sepolia],
  transports: {
    [sepolia.id]: http("https://ethereum-sepolia.publicnode.com"),
  },
  ssr: false,
});

const { networkConfig } = createNetworkConfig({
  testnet: { url: getJsonRpcFullnodeUrl("testnet") },
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet") },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitProvider>
          <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
            <WalletProvider autoConnect>
              <App />
            </WalletProvider>
          </SuiClientProvider>
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  </StrictMode>
);
