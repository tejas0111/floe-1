# Stream Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the byte-range streaming path on `main` without adding transcoding or multi-quilt storage.

**Architecture:** Keep the existing file-read route and stream cache structure, but make cache entries more trustworthy and observable. Ignore temporary fill files during pruning, clean them up on cache sweep, and emit first-byte timing for cache hits so range reads and cache behavior are measurable.

**Tech Stack:** TypeScript, Fastify, Node.js, filesystem-backed cache, Prometheus-style metrics.

---

### Task 1: Cover the current stream gaps

**Files:**
- Modify: `apps/api/test/files.integration.test.ts`
- Create: `apps/api/test/stream.cache.hardening.test.ts`

- [ ] **Step 1: Write the failing cache-prune test**

```ts
test("initStreamCache ignores temp files when pruning cache entries", async () => {
  // create a real cache file and a stale temp file
  // call initStreamCache()
  // assert the real cache file still exists and the temp file is removed
});
```

- [ ] **Step 2: Write the failing cache-hit observability test**

```ts
test("cached stream responses increment stream ttfb metrics", async () => {
  // snapshot prometheus metrics before request
  // request a stream that hits a pre-seeded cached file
  // snapshot metrics after request
  // assert floe_stream_ttfb_ms_count{range="full"} increased by 1
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `node --test --import tsx ./apps/api/test/stream.cache.hardening.test.ts`

Expected: fail before the cache and cached-hit observability changes exist.

### Task 2: Fix cache pruning and cached-hit observability

**Files:**
- Modify: `apps/api/src/services/stream/stream.cache.ts`
- Modify: `apps/api/src/routes/files.ts`
- Modify: `apps/api/src/services/metrics/runtime.metrics.ts`

- [ ] **Step 1: Implement temp-file-aware cache listing**

Filter `.tmp-` fill files out of normal prune size accounting, but delete stale temp files during cache sweeps.

- [ ] **Step 2: Record temp-file cleanup as eviction**

When sweep removes expired cache files or stale temp fills, record the eviction reason and bytes through the existing metrics helpers.

- [ ] **Step 3: Emit first-byte timing on cached stream hits**

Hook the cached read-stream branch so the first `data` event records `observeStreamTtfb(...)` just like the non-cached stream path.

- [ ] **Step 4: Re-run the focused tests**

Run: `node --test --import tsx ./apps/api/test/stream.cache.hardening.test.ts`

Expected: PASS.

### Task 3: Verify the stream path still behaves correctly

**Files:**
- Modify: `apps/api/test/files.integration.test.ts`

- [ ] **Step 1: Re-run the stream integration coverage**

Run: `node --test --import tsx ./apps/api/test/files.integration.test.ts`

Expected: PASS.

- [ ] **Step 2: Commit the stream hardening**

Run: `git add -A && git commit -m "fix: harden byte-range stream cache and observability"`

