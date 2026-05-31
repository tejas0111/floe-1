import { ethers } from "ethers";

type NativeMintChain = "base" | "optimism" | "arbitrum" | "avalanche" | "fantom" | "ethsepolia";

export type NativeMintResult = {
  txId: string;
  assetId?: string;
};

export type NativeMintParams = {
  chain: string;
  contractAddress: string;
  privateKey: string;
  to: string;
  tokenId: string;
  metadataUrl: string;
};

export type NativeMintDependencies = {
  createProvider?: (rpcUrl: string) => ethers.JsonRpcProvider;
  createWallet?: (privateKey: string, provider: ethers.Provider) => ethers.Wallet;
  createContract?: (contractAddress: string, signer: ethers.Signer) => {
    mint: (to: string, tokenId: string, uri: string) => Promise<{ hash: string; wait: () => Promise<unknown> }>;
  };
  resolveRpcUrl?: (chain: string) => string;
};

const CHAIN_RPC_URL: Record<NativeMintChain, string> = {
  base: "https://sepolia.base.org",
  optimism: "https://sepolia.optimism.io",
  arbitrum: "https://sepolia-rollup.arbitrum.io/rpc",
  avalanche: "https://api.avax-test.network/ext/bc/C/rpc",
  fantom: "https://rpc.testnet.fantom.network",
  ethsepolia: "https://ethereum-sepolia.publicnode.com",
};

function normalizeChain(rawChain?: string | null): NativeMintChain | null {
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

export function resolveNativeMintRpcUrl(rawChain?: string | null): string {
  const chain = normalizeChain(rawChain);
  if (!chain) {
    return CHAIN_RPC_URL.base;
  }
  return CHAIN_RPC_URL[chain];
}

export function deriveNativeTokenId(params: { chain: string; blobId: string }): string {
  const digest = ethers.sha256(
    ethers.toUtf8Bytes(`${params.chain.trim().toLowerCase()}:${params.blobId.trim()}`)
  );
  return BigInt(digest).toString(10);
}

const FLOE_COLLECTION_ABI = [
  "function mint(address to, uint256 tokenId, string uri)",
];

export async function mintNativeCollection(
  params: NativeMintParams,
  deps: NativeMintDependencies = {}
): Promise<NativeMintResult> {
  const rpcUrl = deps.resolveRpcUrl?.(params.chain) ?? resolveNativeMintRpcUrl(params.chain);
  const provider = deps.createProvider ? deps.createProvider(rpcUrl) : new ethers.JsonRpcProvider(rpcUrl);
  const prefixedPrivateKey = params.privateKey.startsWith("0x") ? params.privateKey : `0x${params.privateKey}`;
  const wallet = deps.createWallet ? deps.createWallet(prefixedPrivateKey, provider) : new ethers.Wallet(prefixedPrivateKey, provider);
  const contract = deps.createContract
    ? deps.createContract(params.contractAddress, wallet)
    : new ethers.Contract(params.contractAddress, FLOE_COLLECTION_ABI, wallet);

  const tx = await contract.mint(params.to, params.tokenId, params.metadataUrl);
  await tx.wait();

  return {
    txId: tx.hash,
    assetId: params.tokenId,
  };
}
