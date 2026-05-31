import test from "node:test";
import assert from "node:assert/strict";

import { resolveTatumMintRoute } from "../src/services/tatum/mint.provider.js";

test("uses NFT Express for Polygon", () => {
  const route = resolveTatumMintRoute("polygon");

  assert.equal(route.mode, "express");
  assert.equal(route.chain, "MATIC");
  assert.equal(route.requiresPrivateKey, false);
});

test("uses native minting for Base", () => {
  const route = resolveTatumMintRoute("base");

  assert.equal(route.mode, "native");
  assert.equal(route.chain, "ETH_BASE");
  assert.equal(route.requiresPrivateKey, true);
});

test("uses native minting for Ethereum Sepolia", () => {
  const route = resolveTatumMintRoute("eth_sepolia");

  assert.equal(route.mode, "native");
  assert.equal(route.chain, "ETH");
  assert.equal(route.requiresPrivateKey, true);
  assert.equal(route.testnetType, "ethereum-sepolia");
});

test("treats op as Optimism native minting", () => {
  const route = resolveTatumMintRoute("op");

  assert.equal(route.mode, "native");
  assert.equal(route.chain, "ETH_OP");
  assert.equal(route.requiresPrivateKey, true);
});

test("treats arb avax and ftm as native minting aliases", () => {
  assert.equal(resolveTatumMintRoute("arb").chain, "ETH_ARB");
  assert.equal(resolveTatumMintRoute("avax").chain, "AVAX");
  assert.equal(resolveTatumMintRoute("ftm").chain, "FTM");
});
