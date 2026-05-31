function normalizeChain(raw: string | null | undefined): string {
  return (raw ?? "sui").toLowerCase();
}

export function explorerUrlFromRecord(record: { targetChain: string | null; anchorTxId: string | null }): string | null {
  if (!record.anchorTxId) return null;
  const rawChain = normalizeChain(record.targetChain);
  const chain = rawChain === "op" ? "optimism" : rawChain === "arb" ? "arbitrum" : rawChain === "avax" ? "avalanche" : rawChain === "ftm" ? "fantom" : rawChain;
  const explorerByChain: Record<string, string> = {
    polygon: "https://polygonscan.com/tx/",
    matic: "https://polygonscan.com/tx/",
    base: "https://sepolia.basescan.org/tx/",
    eth_base: "https://sepolia.basescan.org/tx/",
    arbitrum: "https://sepolia.arbiscan.io/tx/",
    eth_arb: "https://sepolia.arbiscan.io/tx/",
    optimism: "https://testnet-explorer.optimism.io/tx/",
    eth_op: "https://testnet-explorer.optimism.io/tx/",
    op: "https://testnet-explorer.optimism.io/tx/",
    eth_sepolia: "https://sepolia.etherscan.io/tx/",
    celo: "https://celoscan.io/tx/",
    avax: "https://c.testnet.snowtrace.io/tx/",
    avalanche: "https://c.testnet.snowtrace.io/tx/",
    bsc: "https://bscscan.com/tx/",
    fantom: "https://testnet.ftmscan.com/tx/",
    sui: "https://suivision.xyz/txblock/",
  };
  const base = explorerByChain[chain];
  return base ? `${base}${encodeURIComponent(record.anchorTxId)}` : null;
}
