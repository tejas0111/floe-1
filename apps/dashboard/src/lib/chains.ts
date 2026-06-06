import type { ChainConfig } from "@/types";

const CHAIN_ALIASES: Record<string, string> = {
  op: "optimism",
  arb: "arbitrum",
  avax: "avalanche",
  ftm: "fantom",
  ethbase: "base",
  ethop: "optimism",
  etharb: "arbitrum",
  ethsepolia: "ethsepolia",
};

const CHAIN_LABELS: Record<string, string> = {
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

const CHAIN_EXPLORERS: Record<string, string> = {
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

const CHAIN_STYLES: Record<string, { color: string; bg: string }> = {
  sui:         { color: "#0ea5e9", bg: "#e0f2fe" },
  polygon:     { color: "#7c3aed", bg: "#ede9fe" },
  base:        { color: "#2563eb", bg: "#dbeafe" },
  arbitrum:    { color: "#059669", bg: "#d1fae5" },
  optimism:    { color: "#ea580c", bg: "#ffedd5" },
  ethereum:    { color: "#475569", bg: "#f1f5f9" },
  ethsepolia:  { color: "#475569", bg: "#f1f5f9" },
  celo:        { color: "#ca8a04", bg: "#fef9c3" },
  avalanche:   { color: "#dc2626", bg: "#fee2e2" },
  bsc:         { color: "#d97706", bg: "#fef3c7" },
  fantom:      { color: "#4f46e5", bg: "#e0e7ff" },
};

export function normalizeChain(raw?: string | null): string {
  const chain = (raw ?? "sui").toString().trim().toLowerCase().replace(/[-_\s]/g, "");
  return CHAIN_ALIASES[chain] ?? chain;
}

export function chainLabel(raw?: string | null): string {
  const chain = normalizeChain(raw);
  return CHAIN_LABELS[chain] ?? chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function getChainConfig(raw?: string | null): ChainConfig {
  const chain = normalizeChain(raw);
  const label = chainLabel(raw);
  const style = CHAIN_STYLES[chain] ?? { color: "#64748b", bg: "#f8fafc" };
  return {
    label,
    color: style.color,
    bgColor: style.bg,
    explorer: CHAIN_EXPLORERS[chain] ?? "",
  };
}

export function explorerUrl(chain: string | null, txId: string | null): string | null {
  if (!txId) return null;
  const normalized = normalizeChain(chain);
  const base = CHAIN_EXPLORERS[normalized];
  return base ? `${base}${encodeURIComponent(txId)}` : null;
}

export const AVAILABLE_CHAINS = [
  { value: "sui", label: "Sui" },
  { value: "polygon", label: "Polygon" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "eth_sepolia", label: "Ethereum Sepolia" },
  { value: "celo", label: "Celo" },
  { value: "avax", label: "Avalanche" },
  { value: "bsc", label: "BSC" },
  { value: "fantom", label: "Fantom" },
];

export const API_BASE = (import.meta.env.VITE_FLOE_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
