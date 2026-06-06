import { useMemo } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useAccount } from "wagmi";
import type { WalletViewState } from "@/types";

export function useDualWallet() {
  const { address: evmAddress, chain, isConnected: evmConnected, isConnecting: evmConnecting } = useAccount();
  const currentSuiAccount = useCurrentAccount();

  const evm = useMemo<WalletViewState>(
    () => ({
      address: evmAddress ?? null,
      connected: evmConnected,
      connecting: evmConnecting,
      error: null,
      chainName: chain?.name ?? "Ethereum Sepolia",
      label: "EVM Wallet",
    }),
    [evmAddress, evmConnected, evmConnecting, chain?.name]
  );

  const sui = useMemo<WalletViewState>(
    () => ({
      address: currentSuiAccount?.address ?? null,
      connected: !!currentSuiAccount,
      connecting: false,
      error: null,
      label: currentSuiAccount?.label ?? "Sui Wallet",
      chainName: "Sui Testnet",
    }),
    [currentSuiAccount]
  );

  return {
    evm,
    sui,
    address: evm.address ?? sui.address,
    connected: evm.connected || sui.connected,
  };
}
