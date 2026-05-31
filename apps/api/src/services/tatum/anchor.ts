import { ServerConfig } from "../../config/server.config.js";
import { resolveTatumMintRoute } from "./mint.provider.js";
import { resolveTatumNativeContractAddress } from "./native.contract.js";
import { deriveNativeTokenId, mintNativeCollection } from "./native.mint.js";

export { deriveNativeTokenId as deriveTatumTokenId } from "./native.mint.js";

const TATUM_API_KEY = process.env.TATUM_API_KEY;
const TATUM_TEST_PRIVATE_KEY = process.env.TATUM_TEST_PRIVATE_KEY ?? process.env.TATUM_PRIVATE_KEY ?? null;
const TATUM_SIGNATURE_ID = process.env.TATUM_SIGNATURE_ID ?? null;

export interface MultiChainAnchorParams {
  chain: string;
  to: string;
  blobId: string;
  sizeBytes: number;
  checksum?: string | null;
  mimeType: string;
  filename: string;
}

export interface MultiChainAnchorResult {
  txId: string;
  assetId?: string;
}

export function buildTatumMintRequestBody(params: {
  blobId: string;
  to: string;
  metadataUrl: string;
  mintRoute: ReturnType<typeof resolveTatumMintRoute>;
  contractAddress?: string | null;
  privateKey?: string | null;
  signatureId?: string | null;
}) {
  const body: Record<string, unknown> = {
    chain: params.mintRoute.chain,
    to: params.to,
    url: params.metadataUrl,
  };

  if (params.mintRoute.mode === "native") {
    if (!params.contractAddress) {
      throw new Error("TATUM_NATIVE_CONTRACT_ADDRESS is not set for native Tatum minting");
    }
    body.contractAddress = params.contractAddress;
    body.tokenId = deriveNativeTokenId({ chain: params.mintRoute.chain, blobId: params.blobId });
    if (params.signatureId) {
      body.signatureId = params.signatureId;
    } else if (params.privateKey) {
      body.fromPrivateKey = params.privateKey;
    } else {
      throw new Error("TATUM_TEST_PRIVATE_KEY or TATUM_SIGNATURE_ID is required for native Tatum minting");
    }
  }

  return body;
}

export async function anchorMetadataMultiChain(params: MultiChainAnchorParams): Promise<MultiChainAnchorResult> {
  const baseUrl = ServerConfig.publicBaseUrl.replace(/\/$/, "");
  const mintRoute = resolveTatumMintRoute(params.chain);

  // The metadata URL should point to a JSON endpoint that returns the NFT metadata.
  // In Floe, we have GET /v1/files/:fileId/metadata.json for this purpose.
  const metadataUrl = `${baseUrl}/v1/files/${params.blobId}/metadata.json`;

  if (metadataUrl.includes("localhost") || metadataUrl.includes("127.0.0.1")) {
    console.warn(`[Tatum] Warning: metadataUrl (${metadataUrl}) is on localhost. Tatum's minting service may not be able to reach it.`);
  }

  const tatumChain = mintRoute.chain;

  console.log(`[Tatum] Anchoring ${params.blobId} to ${tatumChain} via ${mintRoute.mode}...`);

  if (mintRoute.mode === "native") {
    const nativeContract = resolveTatumNativeContractAddress(params.chain);
    if (!nativeContract.contractAddress) {
      const missingEnv = nativeContract.envVar ?? "TATUM_NATIVE_CONTRACT_ADDRESS";
      throw new Error(`${missingEnv} is not set for native minting`);
    }
    if (!TATUM_TEST_PRIVATE_KEY) {
      throw new Error("TATUM_TEST_PRIVATE_KEY is required for native minting");
    }

    const tokenId = deriveNativeTokenId({ chain: params.chain, blobId: params.blobId });
    const result = await mintNativeCollection({
      chain: params.chain,
      contractAddress: nativeContract.contractAddress,
      privateKey: TATUM_TEST_PRIVATE_KEY,
      to: params.to,
      tokenId,
      metadataUrl,
    });

    console.log(`[Tatum] Successfully anchored to ${tatumChain}. TxID: ${result.txId}`);
    return result;
  }

  if (!TATUM_API_KEY) {
    throw new Error("TATUM_API_KEY is not set");
  }

  const body = buildTatumMintRequestBody({
    blobId: params.blobId,
    to: params.to,
    metadataUrl,
    mintRoute,
    contractAddress: null,
    privateKey: null,
    signatureId: null,
  });

  try {
    const mintUrl = new URL("https://api.tatum.io/v3/nft/mint");
    if (mintRoute.testnetType) {
      mintUrl.searchParams.set("testnetType", mintRoute.testnetType);
    }

    const response = await fetch(mintUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": TATUM_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = text;
      }

      console.error("[Tatum] Minting failed:", {
        status: response.status,
        error: errorData,
        chain: tatumChain,
        to: params.to
      });

      throw new Error(`TATUM_NFT_MINT_FAILED:${response.status}:${text}`);
    }

    const json = (await response.json()) as any;
    console.log(`[Tatum] Successfully anchored to ${tatumChain}. TxID: ${json.txId}`);

    return {
      txId: json.txId,
      assetId: json.tokenId,
    };
  } catch (err: any) {
    if (err.message.includes("TATUM_NFT_MINT_FAILED")) throw err;
    
    console.error("[Tatum] Network or unexpected error:", err.message);
    throw new Error(`TATUM_CONNECTION_ERROR:${err.message}`);
  }
}
