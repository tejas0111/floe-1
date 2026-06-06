import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { WagmiProvider, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Toaster } from "@/components/ui/sonner";
import { DashboardStateProvider } from "./dashboard-state";

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
  testnet: { network: "testnet", url: "https://fullnode.testnet.sui.io:443" },
  mainnet: { network: "mainnet", url: "https://fullnode.mainnet.sui.io:443" },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitProvider>
          <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
            <WalletProvider autoConnect>
              <DashboardStateProvider>{children}</DashboardStateProvider>
              <Toaster />
            </WalletProvider>
          </SuiClientProvider>
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
