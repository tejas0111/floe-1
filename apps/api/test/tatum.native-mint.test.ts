import test from "node:test";
import assert from "node:assert/strict";

import { mintNativeCollection, resolveNativeMintRpcUrl } from "../src/services/tatum/native.mint.js";

test("resolves the Base Sepolia rpc url by default", () => {
  assert.equal(resolveNativeMintRpcUrl("base"), "https://sepolia.base.org");
});

test("resolves op to the Optimism Sepolia rpc url", () => {
  assert.equal(resolveNativeMintRpcUrl("op"), "https://sepolia.optimism.io");
});

test("resolves arb avax and ftm to their native rpc urls", () => {
  assert.equal(resolveNativeMintRpcUrl("arb"), "https://sepolia-rollup.arbitrum.io/rpc");
  assert.equal(resolveNativeMintRpcUrl("avax"), "https://api.avax-test.network/ext/bc/C/rpc");
  assert.equal(resolveNativeMintRpcUrl("ftm"), "https://rpc.testnet.fantom.network");
});

test("mints directly against the native collection contract", async () => {
  const calls: Array<unknown[]> = [];
  const contract = {
    mint: async (...args: unknown[]) => {
      calls.push(args);
      return {
        hash: "0xabc",
        wait: async () => ({ status: 1 }),
      };
    },
  };

  const result = await mintNativeCollection(
    {
      chain: "base",
      contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      privateKey: "0x1234",
      to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      tokenId: "123",
      metadataUrl: "https://example.com/metadata.json",
    },
    {
      createWallet: () => ({ address: "0xwallet", connect: () => ({}) }),
      createProvider: () => ({}),
      createContract: () => contract as never,
    }
  );

  assert.equal(result.txId, "0xabc");
  assert.equal(result.assetId, "123");
  assert.deepEqual(calls, [[
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "123",
    "https://example.com/metadata.json",
  ]]);
});
