declare module "../../../shared/chains.mjs" {
  export const CHAIN_ALIASES: Record<string, string>;
  export const CHAIN_LABELS: Record<string, string>;
  export const CHAIN_EXPLORERS: Record<string, string>;
  export const EXPRESS_CHAIN_MAP: Record<string, string>;
  export const NATIVE_CHAIN_MAP: Record<string, string>;
  export const NATIVE_CONTRACT_ENV_BY_CHAIN: Record<string, string>;
  export const NATIVE_RPC_URL_BY_CHAIN: Record<string, string>;

  export function normalizeChain(raw?: string | null): string;
  export function chainLabel(raw?: string | null): string;
  export function explorerUrlFromRecord(record: { targetChain: string | null; anchorTxId: string | null }): string | null;
  export function resolveTatumMintRoute(rawChain?: string | null): {
    chain: string;
    mode: "express" | "native";
    requiresPrivateKey: boolean;
    requiresContractAddress: boolean;
    testnetType?: "ethereum-sepolia";
  };
  export function resolveNativeContractAddress(rawChain?: string | null): {
    chain: string;
    contractAddress: string | null;
    envVar: string | null;
  };
  export function resolveNativeMintRpcUrl(rawChain?: string | null): string;
}
