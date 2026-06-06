export const CHAIN_ALIASES: Record<string, string> = {
  op: "optimism",
  arb: "arbitrum",
  avax: "avalanche",
  ftm: "fantom",
  ethbase: "base",
  ethop: "optimism",
  etharb: "arbitrum",
  ethsepolia: "ethsepolia",
  sepolia: "ethsepolia",
  ethereumsepolia: "ethsepolia",
};

export const CHAIN_LABELS: Record<string, string> = {
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

export const CHAIN_EXPLORERS: Record<string, string> = {
  polygon: "https://polygonscan.com/tx/",
  matic: "https://polygonscan.com/tx/",
  base: "https://sepolia.basescan.org/tx/",
  arbitrum: "https://sepolia.arbiscan.io/tx/",
  optimism: "https://testnet-explorer.optimism.io/tx/",
  ethsepolia: "https://sepolia.etherscan.io/tx/",
  celo: "https://celoscan.io/tx/",
  avalanche: "https://c.testnet.snowtrace.io/tx/",
  avax: "https://c.testnet.snowtrace.io/tx/",
  bsc: "https://bscscan.com/tx/",
  fantom: "https://testnet.ftmscan.com/tx/",
  sui: "https://suivision.xyz/txblock/",
};

export function normalizeChain(raw: string | null | undefined): string {
  const chain = String(raw ?? "sui").trim().toLowerCase().replace(/[-_\s]/g, "");
  return CHAIN_ALIASES[chain] ?? chain;
}

export function chainLabel(raw: string | null | undefined): string {
  const chain = normalizeChain(raw);
  return CHAIN_LABELS[chain] ?? chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function explorerUrlFromRecord(record: { targetChain: string | null; anchorTxId: string | null }): string | null {
  if (!record.anchorTxId) return null;
  const chain = normalizeChain(record.targetChain);
  const base = CHAIN_EXPLORERS[chain];
  return base ? `${base}${encodeURIComponent(record.anchorTxId)}` : null;
}

export function isPrimaryDemoChain(raw: string | null | undefined): boolean {
  return normalizeChain(raw) === "ethsepolia";
}
