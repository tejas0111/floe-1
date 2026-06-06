export const CHAIN_ALIASES = {
  op: "optimism",
  arb: "arbitrum",
  avax: "avalanche",
  ftm: "fantom",
  ethbase: "base",
  ethop: "optimism",
  etharb: "arbitrum",
  ethsepolia: "ethsepolia",
};

export const CHAIN_LABELS = {
  sui: "Sui",
  eth: "Ethereum",
  ethereum: "Ethereum",
  mainnet: "Ethereum",
  ethsepolia: "Ethereum Sepolia",
  sepolia: "Ethereum Sepolia",
  polygon: "Polygon",
  matic: "Polygon",
  base: "Base",
  optimism: "Optimism",
  arbitrum: "Arbitrum",
  celo: "Celo",
  alfajores: "Celo",
  avax: "Avalanche",
  avalanche: "Avalanche",
  bsc: "BSC",
  bnb: "BSC",
  binance: "BSC",
  fantom: "Fantom",
};

export const CHAIN_EXPLORERS = {
  eth: "https://etherscan.io/tx/",
  ethereum: "https://etherscan.io/tx/",
  mainnet: "https://etherscan.io/tx/",
  polygon: "https://amoy.polygonscan.com/tx/",
  matic: "https://amoy.polygonscan.com/tx/",
  base: "https://sepolia.basescan.org/tx/",
  arbitrum: "https://sepolia.arbiscan.io/tx/",
  optimism: "https://testnet-explorer.optimism.io/tx/",
  ethsepolia: "https://sepolia.etherscan.io/tx/",
  celo: "https://celoscan.io/tx/",
  avalanche: "https://c.testnet.snowtrace.io/tx/",
  bsc: "https://bscscan.com/tx/",
  fantom: "https://testnet.ftmscan.com/tx/",
  sui: "https://testnet.suivision.xyz/txblock/",
};

export const EXPRESS_CHAIN_MAP = {
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

export const NATIVE_CHAIN_MAP = {
  base: "ETH_BASE",
  optimism: "ETH_OP",
  arbitrum: "ETH_ARB",
  avalanche: "AVAX",
  fantom: "FTM",
  ethsepolia: "ETH",
  sepolia: "ETH",
};

export const NATIVE_CONTRACT_ENV_BY_CHAIN = {
  base: "TATUM_NATIVE_CONTRACT_ADDRESS_BASE",
  optimism: "TATUM_NATIVE_CONTRACT_ADDRESS_OPTIMISM",
  arbitrum: "TATUM_NATIVE_CONTRACT_ADDRESS_ARBITRUM",
  avalanche: "TATUM_NATIVE_CONTRACT_ADDRESS_AVALANCHE",
  fantom: "TATUM_NATIVE_CONTRACT_ADDRESS_FANTOM",
  ethsepolia: "TATUM_NATIVE_CONTRACT_ADDRESS_ETH_SEPOLIA",
  sepolia: "TATUM_NATIVE_CONTRACT_ADDRESS_ETH_SEPOLIA",
};

export const NATIVE_RPC_URL_BY_CHAIN = {
  base: "https://sepolia.base.org",
  optimism: "https://sepolia.optimism.io",
  arbitrum: "https://sepolia-rollup.arbitrum.io/rpc",
  avalanche: "https://api.avax-test.network/ext/bc/C/rpc",
  fantom: "https://rpc.testnet.fantom.network",
  ethsepolia: "https://ethereum-sepolia.publicnode.com",
  sepolia: "https://ethereum-sepolia.publicnode.com",
};

export function normalizeChain(raw) {
  const chain = (raw ?? "sui").toString().trim().toLowerCase().replace(/[-_\s]/g, "");
  return CHAIN_ALIASES[chain] ?? chain;
}

export function chainLabel(raw) {
  const chain = normalizeChain(raw);
  return CHAIN_LABELS[chain] ?? chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function explorerUrlFromRecord(record) {
  if (!record?.anchorTxId) return null;
  const chain = normalizeChain(record.targetChain);
  const base = CHAIN_EXPLORERS[chain];
  return base ? `${base}${encodeURIComponent(record.anchorTxId)}` : null;
}

export function resolveTatumMintRoute(rawChain) {
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

export function resolveNativeContractAddress(rawChain) {
  const chain = normalizeChain(rawChain);
  const specificEnvVar = NATIVE_CONTRACT_ENV_BY_CHAIN[chain] ?? null;
  if (!specificEnvVar) {
    return { chain, contractAddress: null, envVar: null };
  }
  const specificValue = process.env[specificEnvVar]?.trim() ?? "";
  if (specificValue) {
    return { chain, contractAddress: specificValue, envVar: specificEnvVar };
  }
  const fallbackValue = process.env.TATUM_NATIVE_CONTRACT_ADDRESS?.trim() ?? "";
  if (fallbackValue) {
    return { chain, contractAddress: fallbackValue, envVar: "TATUM_NATIVE_CONTRACT_ADDRESS" };
  }
  return { chain, contractAddress: null, envVar: specificEnvVar };
}

export function resolveNativeMintRpcUrl(rawChain) {
  const chain = normalizeChain(rawChain);
  return NATIVE_RPC_URL_BY_CHAIN[chain] ?? NATIVE_RPC_URL_BY_CHAIN.base;
}
