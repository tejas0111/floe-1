import test from "node:test";
import assert from "node:assert/strict";

const ENV_KEYS = [
  "TATUM_NATIVE_CONTRACT_ADDRESS",
  "TATUM_NATIVE_CONTRACT_ADDRESS_BASE",
  "TATUM_NATIVE_CONTRACT_ADDRESS_OPTIMISM",
  "TATUM_NATIVE_CONTRACT_ADDRESS_ARBITRUM",
  "TATUM_NATIVE_CONTRACT_ADDRESS_AVALANCHE",
  "TATUM_NATIVE_CONTRACT_ADDRESS_FANTOM",
  "TATUM_NATIVE_CONTRACT_ADDRESS_ETH_SEPOLIA",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("selects the Base-specific native contract address", async () => {
  const previous = snapshotEnv();
  try {
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS_BASE = "0x2222222222222222222222222222222222222222";

    const { resolveTatumNativeContractAddress } = await import(
      "../src/services/tatum/native.contract.js"
    );

    const result = resolveTatumNativeContractAddress("base");

    assert.equal(result.contractAddress, "0x2222222222222222222222222222222222222222");
    assert.equal(result.envVar, "TATUM_NATIVE_CONTRACT_ADDRESS_BASE");
  } finally {
    restoreEnv(previous);
  }
});

test("falls back to the generic native contract address", async () => {
  const previous = snapshotEnv();
  try {
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS = "0x3333333333333333333333333333333333333333";
    delete process.env.TATUM_NATIVE_CONTRACT_ADDRESS_BASE;

    const { resolveTatumNativeContractAddress } = await import(
      "../src/services/tatum/native.contract.js"
    );

    const result = resolveTatumNativeContractAddress("base");

    assert.equal(result.contractAddress, "0x3333333333333333333333333333333333333333");
    assert.equal(result.envVar, "TATUM_NATIVE_CONTRACT_ADDRESS");
  } finally {
    restoreEnv(previous);
  }
});

test("selects the Ethereum Sepolia-specific native contract address", async () => {
  const previous = snapshotEnv();
  try {
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS = "0x4444444444444444444444444444444444444444";
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS_ETH_SEPOLIA = "0x5555555555555555555555555555555555555555";

    const { resolveTatumNativeContractAddress } = await import(
      "../src/services/tatum/native.contract.js"
    );

    const result = resolveTatumNativeContractAddress("eth_sepolia");

    assert.equal(result.contractAddress, "0x5555555555555555555555555555555555555555");
    assert.equal(result.envVar, "TATUM_NATIVE_CONTRACT_ADDRESS_ETH_SEPOLIA");
  } finally {
    restoreEnv(previous);
  }
});

test("treats op as the Optimism native contract address", async () => {
  const previous = snapshotEnv();
  try {
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS = "0x6666666666666666666666666666666666666666";
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS_OPTIMISM = "0x7777777777777777777777777777777777777777";

    const { resolveTatumNativeContractAddress } = await import(
      "../src/services/tatum/native.contract.js"
    );

    const result = resolveTatumNativeContractAddress("op");

    assert.equal(result.contractAddress, "0x7777777777777777777777777777777777777777");
    assert.equal(result.envVar, "TATUM_NATIVE_CONTRACT_ADDRESS_OPTIMISM");
  } finally {
    restoreEnv(previous);
  }
});

test("treats arb avax and ftm as native contract aliases", async () => {
  const previous = snapshotEnv();
  try {
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS_ARBITRUM = "0x8888888888888888888888888888888888888888";
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS_AVALANCHE = "0x9999999999999999999999999999999999999999";
    process.env.TATUM_NATIVE_CONTRACT_ADDRESS_FANTOM = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const { resolveTatumNativeContractAddress } = await import(
      "../src/services/tatum/native.contract.js"
    );

    assert.equal(resolveTatumNativeContractAddress("arb").contractAddress, "0x8888888888888888888888888888888888888888");
    assert.equal(resolveTatumNativeContractAddress("avax").contractAddress, "0x9999999999999999999999999999999999999999");
    assert.equal(resolveTatumNativeContractAddress("ftm").contractAddress, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  } finally {
    restoreEnv(previous);
  }
});
