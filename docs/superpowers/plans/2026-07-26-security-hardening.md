# Security Hardening

Address findings from security review of the Floe API server.

## Global Constraints

- All changes must use Node.js built-in `crypto.randomBytes` for random nonces
- Config validation warnings are additive — never change error/warning severity of existing checks
- All env vars parsed through existing `parsePositiveIntEnv` / `parseBoolEnv` utilities
- Follow existing code style: no comments unless required by the task spec
- Tests use Node's built-in `node:test` and `node:assert` (matching `test` script in `apps/api/package.json`)
- Use `importFresh` helper from test fixtures when re-importing modules with fresh env vars
- All temp directories must use `fs.mkdtemp` with `0o700` mode

## Task 1: Harden Walrus CLI Backend

**Files:**
- `apps/api/src/services/walrus/backends/cli.ts`

**Changes:**

1a. **Temp file permissions (M1):** Replace `os.tmpdir()` + `createWriteStream` with `fs.mkdtemp` in a floe-specific temp directory under `os.tmpdir()`, created with mode `0o700`. Write the blob data into a file inside this restricted directory.

1b. **Binary path pinning (M3):** Add a startup-time `resolveWalrusCliBin()` function that uses `which` or `command -v` (via `execFile`) to resolve `WALRUS_CLI_BIN` to an absolute path. Throw on startup if not found (not at upload time). Cache the resolved path in a module-level variable. The env var `FLOE_WALRUS_CLI_BIN` still controls which binary to resolve.

1c. **Blob size validation (L4):** Before writing to the temp file, check if the stream has a known `content-length`. If it exceeds Walrus's max blob size (13.6 GiB = ~14_600_000_000 bytes, use `14_600_000_000` as a `MAX_WALRUS_BLOB_BYTES` constant), reject with a clear `WALRUS_BLOB_TOO_LARGE` error. If content-length is unknown (streaming chunks), skip the check — the CLI will fail upstream.

**Tests:**
- Test that `resolveWalrusCliBin()` returns absolute path when binary exists
- Test that temp dir has restricted permissions
- Test that blob size validation rejects oversized blobs
- Test that existing upload logic still works

## Task 2: Add Nonce to Walrus Publisher Auth

**Files:**
- `apps/api/src/services/walrus/backends/publisher.ts`

**Changes:**

2a. Generate a cryptographically random nonce (16 bytes hex-encoded via `crypto.randomBytes(16).toString('hex')`) in `createAuthHeaders`. Include it in the signed message: `${apiBaseUrl}:${address}:${timestamp}:${nonce}`. Send it as an `X-Sui-Nonce` header.

2b. Tests for the new nonce in auth headers.

## Task 3: Cap Renew Cache with Eviction

**Files:**
- `apps/api/src/services/walrus/renew.ts`

**Changes:**

3a. Replace the unbounded `Map` cache with one that has a maximum size of 1000 entries. When the cache exceeds max size, delete the single oldest expired entry (scan entries, pick the one with the earliest `expiresAt`). If no expired entries exist (all are fresh), do not evict.

3b. Add a `setInterval`-based periodic cleanup every 60 seconds that removes all expired entries from the cache.

3c. Tests for cache eviction and periodic cleanup.

## Task 4: Startup Config Validation Improvements

**Files:**
- `apps/api/src/utils/configValidation.ts`

**Changes:**

4a. **KMS-in-production warning (M2):** When `NODE_ENV=production` and `FLOE_SIGNER_BACKEND` is not `kms` (or is absent/defaults to `env`), add a warning: `"WARNING: Running in production with env-based signer (FLOE_SIGNER_BACKEND=env). Consider using FLOE_SIGNER_BACKEND=kms for production deployments."`

4b. **CLI config warning on mainnet (L3):** When `FLOE_NETWORK=mainnet` and `FLOE_WALRUS_STORE_MODE=cli` and no explicit `FLOE_WALRUS_CLI_CONFIG` is set, add a warning: `"WARNING: FLOE_WALRUS_STORE_MODE=cli on mainnet without FLOE_WALRUS_CLI_CONFIG. The walrus CLI will use its default config path, which may not exist."`

**Tests:**
- Test that production + env signer produces a warning
- Test that production + kms signer does NOT produce the warning
- Test that mainnet + cli mode without config produces a warning
