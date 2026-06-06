export const publicUploadLimitBytes = 5 * 1024 * 1024;
export const walletUploadLimitBytes = 10 * 1024 * 1024;

export const dashboardChainOptions = [
  { value: "", label: "All chains" },
  { value: "sui", label: "Sui" },
  { value: "eth_sepolia", label: "Ethereum Sepolia" },
  { value: "polygon", label: "Polygon" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "celo", label: "Celo" },
  { value: "avax", label: "Avalanche" },
  { value: "bsc", label: "BSC" },
  { value: "fantom", label: "Fantom" },
] as const;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function readChunkHash(blob: Blob): Promise<{ buffer: ArrayBuffer; sha256: string }> {
  const buffer = await blob.arrayBuffer();
  return { buffer, sha256: await sha256Hex(buffer) };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
