import test from "node:test";
import assert from "node:assert/strict";

const previousDefaultOwner = process.env.FLOE_DEFAULT_OWNER_ADDRESS;
process.env.FLOE_DEFAULT_OWNER_ADDRESS =
  process.env.FLOE_DEFAULT_OWNER_ADDRESS ??
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const {
  normalizeEvmAddress,
  normalizeSuiAddress,
  resolveNativeFinalizeRecipient,
  resolveSuiFinalizeOwner,
} = await import("../src/services/uploads/owner-routing.js");

if (previousDefaultOwner === undefined) {
  delete process.env.FLOE_DEFAULT_OWNER_ADDRESS;
} else {
  process.env.FLOE_DEFAULT_OWNER_ADDRESS = previousDefaultOwner;
}

test("resolveSuiFinalizeOwner ignores EVM owner hints and falls back safely", () => {
  assert.equal(
    resolveSuiFinalizeOwner("0x1234567890abcdef1234567890abcdef12345678"),
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
  assert.equal(
    resolveSuiFinalizeOwner("0xE3C6814f60429EaED1b64Bd059aeaca9bEB89aC5"),
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
});

test("resolveNativeFinalizeRecipient keeps valid EVM recipients and falls back otherwise", () => {
  assert.equal(
    resolveNativeFinalizeRecipient("0xE3C6814f60429EaED1b64Bd059aeaca9bEB89aC5"),
    "0xe3c6814f60429eaed1b64bd059aeaca9beb89ac5"
  );
  assert.equal(
    resolveNativeFinalizeRecipient("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"),
    "0x49678aab11e001eb3cb2cbd9aa96b36dc2461a94"
  );
});

test("normalize address helpers preserve valid chain-specific address shapes", () => {
  assert.equal(
    normalizeSuiAddress("0x" + "a".repeat(64)),
    "0x" + "a".repeat(64)
  );
  assert.equal(
    normalizeEvmAddress("0xE3C6814f60429EaED1b64Bd059aeaca9bEB89aC5"),
    "0xe3c6814f60429eaed1b64bd059aeaca9beb89ac5"
  );
  assert.equal(
    normalizeSuiAddress("0x1234567890abcdef1234567890abcdef12345678"),
    undefined
  );
  assert.equal(
    normalizeEvmAddress("0xE3C6814f60429EaED1b64Bd059aeaca9bEB89aC5"),
    "0xe3c6814f60429eaed1b64bd059aeaca9beb89ac5"
  );
  assert.equal(
    normalizeEvmAddress("0x1234567890abcdef1234567890abcdef1234567"),
    undefined
  );
});
