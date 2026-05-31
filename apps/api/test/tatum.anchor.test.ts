import test from "node:test";
import assert from "node:assert/strict";

import { buildTatumMintRequestBody, deriveTatumTokenId } from "../src/services/tatum/anchor.js";
import { resolveTatumMintRoute } from "../src/services/tatum/mint.provider.js";

test("uses fromPrivateKey for native EVM minting", () => {
  const route = resolveTatumMintRoute("base");
  const tokenId = deriveTatumTokenId({ chain: route.chain, blobId: "blob-1" });

  const body = buildTatumMintRequestBody({
    blobId: "blob-1",
    to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    metadataUrl: "https://example.com/metadata.json",
    mintRoute: route,
    contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    privateKey: "0x1234",
  });

  assert.equal(body.chain, "ETH_BASE");
  assert.equal(body.contractAddress, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(body.tokenId, tokenId);
  assert.equal(body.fromPrivateKey, "0x1234");
  assert.equal(body.signatureId, undefined);
  assert.equal(body.privateKey, undefined);
});

test("prefers signatureId over private key", () => {
  const route = resolveTatumMintRoute("eth_sepolia");
  const tokenId = deriveTatumTokenId({ chain: route.chain, blobId: "blob-2" });

  const body = buildTatumMintRequestBody({
    blobId: "blob-2",
    to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    metadataUrl: "https://example.com/metadata.json",
    mintRoute: route,
    contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    privateKey: "0x1234",
    signatureId: "sig-1",
  });

  assert.equal(body.chain, "ETH");
  assert.equal(body.tokenId, tokenId);
  assert.equal(body.signatureId, "sig-1");
  assert.equal(body.fromPrivateKey, undefined);
});
