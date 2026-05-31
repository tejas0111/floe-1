import { resolveTatumMintRoute as resolveTatumMintRouteShared } from "../chains.js";

export type TatumMintMode = "express" | "native";

export interface TatumMintRoute {
  chain: string;
  mode: TatumMintMode;
  requiresPrivateKey: boolean;
  requiresContractAddress: boolean;
  testnetType?: "ethereum-sepolia";
}

export function resolveTatumMintRoute(rawChain?: string | null): TatumMintRoute {
  return resolveTatumMintRouteShared(rawChain) as TatumMintRoute;
}
