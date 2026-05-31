import { ethers } from "ethers";
import { resolveNativeMintRpcUrl as resolveNativeMintRpcUrlShared } from "../chains.js";

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

export function resolveNativeMintRpcUrl(rawChain?: string | null): string {
  return resolveNativeMintRpcUrlShared(rawChain);
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
