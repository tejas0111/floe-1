import test, { after } from "node:test";
import assert from "node:assert/strict";

process.env.FLOE_WALRUS_CLI_BIN = process.env.FLOE_WALRUS_CLI_BIN ?? "echo";

const mod = await import("../src/services/walrus/renew.js");
const { __test__ } = mod;
const { renewResultCache, cacheSet, stopRenewCacheCleanup, MAX_CACHE_SIZE } = __test__;

after(() => {
  stopRenewCacheCleanup();
  renewResultCache.clear();
});

test("cache stores and returns cached entries", () => {
  renewResultCache.clear();
  const key = "test:store";
  const entry = { result: { endEpoch: 42 }, expiresAt: Date.now() + 10_000 };
  renewResultCache.set(key, entry);
  assert.equal(renewResultCache.get(key), entry);
  assert.equal(renewResultCache.get(key)!.result.endEpoch, 42);
  assert.ok(renewResultCache.get(key)!.expiresAt > Date.now());
});

test("expired entries are detected by the cache lookup logic", () => {
  renewResultCache.clear();
  const freshKey = "test:fresh";
  const expiredKey = "test:expired";
  renewResultCache.set(freshKey, {
    result: { endEpoch: 1 },
    expiresAt: Date.now() + 60_000,
  });
  renewResultCache.set(expiredKey, {
    result: { endEpoch: 2 },
    expiresAt: Date.now() - 1_000,
  });

  const fresh = renewResultCache.get(freshKey);
  assert.ok(fresh !== undefined);
  assert.ok(fresh.expiresAt > Date.now(), "fresh entry should not be expired");

  const expired = renewResultCache.get(expiredKey);
  assert.ok(expired !== undefined);
  assert.ok(expired.expiresAt < Date.now(), "expired entry should have past expiresAt");
});

test("cache evicts oldest expired entry when at capacity and expired entries exist", () => {
  renewResultCache.clear();

  renewResultCache.set("expired:old", {
    result: { endEpoch: -1 },
    expiresAt: Date.now() - 10_000,
  });

  for (let i = 1; i < MAX_CACHE_SIZE - 1; i++) {
    renewResultCache.set(`fresh:${i}`, {
      result: { endEpoch: i },
      expiresAt: Date.now() + 60_000,
    });
  }

  renewResultCache.set("expired:recent", {
    result: { endEpoch: -2 },
    expiresAt: Date.now() - 1_000,
  });

  assert.equal(renewResultCache.size, MAX_CACHE_SIZE);

  cacheSet("new:entry", {
    result: { endEpoch: 999 },
    expiresAt: Date.now() + 60_000,
  });

  assert.equal(renewResultCache.size, MAX_CACHE_SIZE);
  assert.ok(!renewResultCache.has("expired:old"), "oldest expired entry should be evicted");
  assert.ok(renewResultCache.has("new:entry"), "new entry should be present");
});

test("cache does not evict when all entries are fresh", () => {
  renewResultCache.clear();

  for (let i = 0; i < MAX_CACHE_SIZE; i++) {
    renewResultCache.set(`fresh:${i}`, {
      result: { endEpoch: i },
      expiresAt: Date.now() + 60_000,
    });
  }

  assert.equal(renewResultCache.size, MAX_CACHE_SIZE);

  cacheSet("new:fresh", {
    result: { endEpoch: MAX_CACHE_SIZE },
    expiresAt: Date.now() + 60_000,
  });

  assert.equal(renewResultCache.size, MAX_CACHE_SIZE + 1);
});

test("stopRenewCacheCleanup clears the timer", () => {
  assert.equal(typeof stopRenewCacheCleanup, "function");
  stopRenewCacheCleanup();
  stopRenewCacheCleanup();
});
