type NativeTatumChain = "base" | "optimism" | "arbitrum" | "avalanche" | "fantom" | "ethsepolia";

export type ResolvedNativeContractAddress = {
  chain: NativeTatumChain;
  contractAddress: string | null;
  envVar: string | null;
};

const NATIVE_CONTRACT_ENV_BY_CHAIN: Record<NativeTatumChain, string> = {
  base: "TATUM_NATIVE_CONTRACT_ADDRESS_BASE",
  optimism: "TATUM_NATIVE_CONTRACT_ADDRESS_OPTIMISM",
  arbitrum: "TATUM_NATIVE_CONTRACT_ADDRESS_ARBITRUM",
  avalanche: "TATUM_NATIVE_CONTRACT_ADDRESS_AVALANCHE",
  fantom: "TATUM_NATIVE_CONTRACT_ADDRESS_FANTOM",
  ethsepolia: "TATUM_NATIVE_CONTRACT_ADDRESS_ETH_SEPOLIA",
};

function normalizeChain(rawChain?: string | null): NativeTatumChain | null {
  const raw = rawChain?.trim().toLowerCase();
  const chain = raw ? raw.replace(/[-_\s]/g, "") : "";
  const normalized = chain === "op" ? "optimism" : chain === "arb" ? "arbitrum" : chain === "avax" ? "avalanche" : chain === "ftm" ? "fantom" : chain;
  if (
    normalized === "base" ||
    normalized === "optimism" ||
    normalized === "arbitrum" ||
    normalized === "avalanche" ||
    normalized === "fantom" ||
    normalized === "ethsepolia"
  ) {
    return normalized;
  }
  return null;
}

export function resolveTatumNativeContractAddress(rawChain?: string | null): ResolvedNativeContractAddress {
  const chain = normalizeChain(rawChain);
  if (!chain) {
    return { chain: "base", contractAddress: null, envVar: null };
  }

  const specificEnvVar = NATIVE_CONTRACT_ENV_BY_CHAIN[chain];
  const specificValue = process.env[specificEnvVar]?.trim() ?? "";
  if (specificValue) {
    return {
      chain,
      contractAddress: specificValue,
      envVar: specificEnvVar,
    };
  }

  const fallbackValue = process.env.TATUM_NATIVE_CONTRACT_ADDRESS?.trim() ?? "";
  if (fallbackValue) {
    return {
      chain,
      contractAddress: fallbackValue,
      envVar: "TATUM_NATIVE_CONTRACT_ADDRESS",
    };
  }

  return {
    chain,
    contractAddress: null,
    envVar: specificEnvVar,
  };
}
