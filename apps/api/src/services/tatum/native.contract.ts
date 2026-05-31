import { resolveNativeContractAddress as resolveNativeContractAddressShared } from "../chains.js";

type NativeTatumChain = "base" | "optimism" | "arbitrum" | "avalanche" | "fantom" | "ethsepolia";

export type ResolvedNativeContractAddress = {
  chain: NativeTatumChain;
  contractAddress: string | null;
  envVar: string | null;
};

export function resolveTatumNativeContractAddress(rawChain?: string | null): ResolvedNativeContractAddress {
  const resolved = resolveNativeContractAddressShared(rawChain);
  return resolved as ResolvedNativeContractAddress;
}
