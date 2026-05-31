export type TatumMintMode = "express" | "native";

export interface TatumMintRoute {
  chain: string;
  mode: TatumMintMode;
  requiresPrivateKey: boolean;
  requiresContractAddress: boolean;
  testnetType?: "ethereum-sepolia";
}

const EXPRESS_CHAIN_MAP: Record<string, string> = {
  bsc: "BSC",
  bnb: "BSC",
  binance: "BSC",
  celo: "CELO",
  alfajores: "CELO",
  eth: "ETH",
  ethereum: "ETH",
  mainnet: "ETH",
  polygon: "MATIC",
  matic: "MATIC",
};

const NATIVE_CHAIN_MAP: Record<string, string> = {
  arbitrum: "ETH_ARB",
  avax: "AVAX",
  avalanche: "AVAX",
  base: "ETH_BASE",
  ethsepolia: "ETH",
  fantom: "FTM",
  optimism: "ETH_OP",
  sepolia: "ETH",
};

function normalizeChain(rawChain?: string | null) {
  const chain = rawChain?.trim().toLowerCase();
  if (!chain) {
    return "sui";
  }
  const normalized = chain.replace(/[-_\s]/g, "");
  if (normalized === "op") return "optimism";
  if (normalized === "arb") return "arbitrum";
  if (normalized === "avax") return "avalanche";
  if (normalized === "ftm") return "fantom";
  return normalized;
}

export function resolveTatumMintRoute(rawChain?: string | null): TatumMintRoute {
  const normalized = normalizeChain(rawChain);
  const expressChain = EXPRESS_CHAIN_MAP[normalized];
  if (expressChain) {
    return {
      chain: expressChain,
      mode: "express",
      requiresPrivateKey: false,
      requiresContractAddress: false,
    };
  }

  const nativeChain = NATIVE_CHAIN_MAP[normalized];
  if (nativeChain) {
    return {
      chain: nativeChain,
      mode: "native",
      requiresPrivateKey: true,
      requiresContractAddress: true,
      testnetType: normalized === "ethsepolia" || normalized === "sepolia" ? "ethereum-sepolia" : undefined,
    };
  }

  throw new Error(`UNSUPPORTED_TATUM_CHAIN:${rawChain ?? "sui"}`);
}
