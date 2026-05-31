import test from "node:test";
import assert from "node:assert/strict";

import { explorerUrlFromRecord } from "../src/services/explorer.urls.js";

test("uses testnet explorers for native chain provenance links", () => {
  assert.equal(
    explorerUrlFromRecord({ targetChain: "base", anchorTxId: "0x1" }),
    "https://sepolia.basescan.org/tx/0x1"
  );
  assert.equal(
    explorerUrlFromRecord({ targetChain: "op", anchorTxId: "0x2" }),
    "https://testnet-explorer.optimism.io/tx/0x2"
  );
  assert.equal(
    explorerUrlFromRecord({ targetChain: "arb", anchorTxId: "0x3" }),
    "https://sepolia.arbiscan.io/tx/0x3"
  );
  assert.equal(
    explorerUrlFromRecord({ targetChain: "avax", anchorTxId: "0x4" }),
    "https://c.testnet.snowtrace.io/tx/0x4"
  );
  assert.equal(
    explorerUrlFromRecord({ targetChain: "eth_sepolia", anchorTxId: "0x5" }),
    "https://sepolia.etherscan.io/tx/0x5"
  );
});
