import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { UploadConfig } from "../../config/uploads.config.js";
import { fetchWalrusBlob } from "../walrus/read.js";
import {
  getStreamCacheFillConcurrency,
  getStreamCacheMaxBytes,
  getStreamCacheTtlMs,
  shouldCacheFullObject as shouldCacheFullObjectPolicy,
} from "./stream.cache.policy.js";
import {
  observeStreamCacheFill,
  recordStreamCacheAccess,
  recordStreamCacheEviction,
  setStreamCacheMetrics,
} from "../metrics/runtime.metrics.js";
import { writeWebBodyToFile } from "./stream.cache.io.js";

export const shouldCacheFullObject = shouldCacheFullObjectPolicy;

const inFlightCacheFill = new Map<string, Promise<string | null>>();
const inFlightRangeFill = new Map<string, Promise<string>>();
let reservedCacheBytes = 0;
let activeCacheFills = 0;
const pendingFillWaiters: Array<() => void> = [];
let cacheReservationLock: Promise<void> = Promise.resolve();

function streamCacheDir() {
  return path.join(UploadConfig.tmpDir, "_stream_cache");
}

function streamCacheFullDir() {
  return path.join(streamCacheDir(), "full");
}

function streamCacheRangeDir() {
  return path.join(streamCacheDir(), "ranges");
}

function sanitizeBlobId(blobId: string): string {
  return blobId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isTempCacheFile(filePath: string): boolean {
  return path.basename(filePath).includes(".tmp-");
}

function streamCachePath(blobId: string): string {
  return path.join(streamCacheFullDir(), `${sanitizeBlobId(blobId)}.blob`);
}

export function getStreamCachePath(blobId: string): string {
  return streamCachePath(blobId);
}

function streamRangeCacheKey(params: { blobId: string; start: number; end: number }): string {
  return `${params.blobId}:${params.start}:${params.end}`;
}

function streamRangeCachePath(params: { blobId: string; start: number; end: number }): string {
  return path.join(
    streamCacheRangeDir(),
    sanitizeBlobId(params.blobId),
    `${params.start}-${params.end}.part`
  );
}

async function ensureStreamCacheDir() {
  await fsp.mkdir(streamCacheFullDir(), { recursive: true });
  await fsp.mkdir(streamCacheRangeDir(), { recursive: true });
}

async function scanCacheFiles(includeTempFiles: boolean) {
  const scanDir = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    const out: Array<{ path: string; size: number; mtimeMs: number }> = [];
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await scanDir(filePath)));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!includeTempFiles && isTempCacheFile(filePath)) continue;
      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat) continue;
      out.push({ path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
    }
    return out;
  };

  return scanDir(streamCacheDir());
}

async function listCacheFiles() {
  return scanCacheFiles(false);
}

async function cleanupTempCacheFiles() {
  const files = await scanCacheFiles(true);
  for (const file of files) {
    if (!isTempCacheFile(file.path)) continue;
    await fsp.rm(file.path, { force: true }).catch(() => {});
  }
}

async function pruneStreamCacheIfNeeded() {
  const streamCacheMaxBytes = getStreamCacheMaxBytes();
  if (!Number.isFinite(streamCacheMaxBytes) || streamCacheMaxBytes <= 0) return;
  const files = await listCacheFiles();
  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes <= streamCacheMaxBytes) return;

  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of files) {
    await fsp.rm(file.path, { force: true }).catch(() => {});
    recordStreamCacheEviction({ reason: "size", bytes: file.size });
    totalBytes -= file.size;
    if (totalBytes <= streamCacheMaxBytes) break;
  }
}

async function sweepExpiredStreamCache() {
  const streamCacheTtlMs = getStreamCacheTtlMs();
  if (!Number.isFinite(streamCacheTtlMs) || streamCacheTtlMs <= 0) return;
  const files = await listCacheFiles();
  const cutoff = Date.now() - streamCacheTtlMs;
  for (const file of files) {
    if (file.mtimeMs > cutoff) continue;
    await fsp.rm(file.path, { force: true }).catch(() => {});
  }
}

async function expireStreamCacheIfNeeded(filePath: string) {
  const streamCacheTtlMs = getStreamCacheTtlMs();
  if (!Number.isFinite(streamCacheTtlMs) || streamCacheTtlMs <= 0) return;
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat) return;
  if (Date.now() - stat.mtimeMs <= streamCacheTtlMs) return;
  await fsp.rm(filePath, { force: true }).catch(() => {});
  recordStreamCacheEviction({ reason: "ttl", bytes: stat.size });
}

export async function initStreamCache() {
  await ensureStreamCacheDir();
  await cleanupTempCacheFiles();
  await sweepExpiredStreamCache();
  await pruneStreamCacheIfNeeded();
}

export async function getCachedStreamPath(
  blobId: string,
  expectedSize?: number
): Promise<string | null> {
  await ensureStreamCacheDir();
  const filePath = streamCachePath(blobId);
  await expireStreamCacheIfNeeded(filePath);
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    recordStreamCacheAccess({ cacheType: "full", outcome: "miss" });
    return null;
  }
  if (expectedSize !== undefined && stat.size !== expectedSize) {
    await fsp.rm(filePath, { force: true }).catch(() => {});
    recordStreamCacheEviction({ reason: "invalid", bytes: stat.size });
    recordStreamCacheAccess({ cacheType: "full", outcome: "miss" });
    return null;
  }
  await fsp.utimes(filePath, new Date(), new Date()).catch(() => {});
  recordStreamCacheAccess({ cacheType: "full", outcome: "hit" });
  return filePath;
}

export async function getCachedStreamRangePath(params: {
  blobId: string;
  start: number;
  end: number;
}): Promise<string | null> {
  await ensureStreamCacheDir();
  const filePath = streamRangeCachePath(params);
  await expireStreamCacheIfNeeded(filePath);
  const stat = await fsp.stat(filePath).catch(() => null);
  const expectedSize = params.end - params.start + 1;
  if (!stat?.isFile() || stat.size !== expectedSize) {
    if (stat) {
      await fsp.rm(filePath, { force: true }).catch(() => {});
      recordStreamCacheEviction({ reason: "invalid", bytes: stat.size });
    }
    recordStreamCacheAccess({ cacheType: "range", outcome: "miss" });
    return null;
  }
  await fsp.utimes(filePath, new Date(), new Date()).catch(() => {});
  recordStreamCacheAccess({ cacheType: "range", outcome: "hit" });
  return filePath;
}

export async function ensureCachedStreamBlob(params: {
  blobId: string;
  sizeBytes: number;
  signal?: AbortSignal;
}): Promise<string | null> {
  if (!shouldCacheFullObjectPolicy(params.sizeBytes)) {
    recordStreamCacheAccess({ cacheType: "full", outcome: "bypass" });
    return null;
  }

  const existing = await getCachedStreamPath(params.blobId, params.sizeBytes);
  if (existing) return existing;

  const inFlight = inFlightCacheFill.get(params.blobId);
  if (inFlight) return inFlight;

  const fillPromise = (async () => {
    const releaseFillSlot = await acquireCacheFillSlot();
    const releaseReservation = await reserveCacheBytes(params.sizeBytes);
    if (!releaseReservation) {
      recordStreamCacheAccess({ cacheType: "full", outcome: "rejected" });
      releaseFillSlot();
      return null;
    }

    await ensureStreamCacheDir();
    const filePath = streamCachePath(params.blobId);
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    const fillStartedAt = Date.now();

    try {
      const { res } = await fetchWalrusBlob({
        blobId: params.blobId,
        rangeHeader: `bytes=0-${params.sizeBytes - 1}`,
        signal: params.signal,
      });

      if (res.status !== 200 && res.status !== 206) {
        const body = await res.text().catch(() => "");
        throw new Error(`WALRUS_CACHE_FILL_FAILED status=${res.status}${body ? ` body=${body.slice(0, 120)}` : ""}`);
      }

      const body = res.body;
      if (!body) throw new Error("WALRUS_CACHE_FILL_MISSING_BODY");

      await writeWebBodyToFile({
        body,
        tempPath,
        expectedBytes: params.sizeBytes,
        truncationErrorPrefix: "STREAM_CACHE_FULL_TRUNCATED",
        signal: params.signal,
      });

      await fsp.rename(tempPath, filePath).catch(async (err) => {
        await fsp.rm(tempPath, { force: true }).catch(() => {});
        throw err;
      });
      await pruneStreamCacheIfNeeded();
      recordStreamCacheAccess({ cacheType: "full", outcome: "filled" });
      observeStreamCacheFill({
        cacheType: "full",
        durationMs: Date.now() - fillStartedAt,
      });
      return filePath;
    } finally {
      releaseReservation();
      releaseFillSlot();
    }
  })().finally(() => {
    inFlightCacheFill.delete(params.blobId);
  });

  inFlightCacheFill.set(params.blobId, fillPromise);
  return fillPromise;
}

export async function ensureCachedStreamRange(params: {
  blobId: string;
  start: number;
  end: number;
  signal?: AbortSignal;
}): Promise<string> {
  const existing = await getCachedStreamRangePath(params);
  if (existing) return existing;

  const rangeKey = streamRangeCacheKey(params);
  const inFlight = inFlightRangeFill.get(rangeKey);
  if (inFlight) return inFlight;

  const fillPromise = (async () => {
    const releaseFillSlot = await acquireCacheFillSlot();
    await ensureStreamCacheDir();
    const cachePath = streamRangeCachePath(params);
    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
    const expectedSize = params.end - params.start + 1;
    const releaseReservation = await reserveCacheBytes(expectedSize);
    if (!releaseReservation) {
      recordStreamCacheAccess({ cacheType: "range", outcome: "rejected" });
      releaseFillSlot();
      throw new Error("STREAM_CACHE_CAPACITY_EXCEEDED");
    }
    const fillStartedAt = Date.now();

    try {
      const { res } = await fetchWalrusBlob({
        blobId: params.blobId,
        rangeHeader: `bytes=${params.start}-${params.end}`,
        signal: params.signal,
      });

      if (res.status !== 206 && !(res.status === 200 && params.start === 0)) {
        const body = await res.text().catch(() => "");
        throw new Error(`WALRUS_CACHE_FILL_FAILED status=${res.status}${body ? ` body=${body.slice(0, 120)}` : ""}`);
      }

      const body = res.body;
      if (!body) throw new Error("WALRUS_CACHE_FILL_MISSING_BODY");

      await writeWebBodyToFile({
        body,
        tempPath,
        expectedBytes: expectedSize,
        truncationErrorPrefix: "STREAM_CACHE_RANGE_TRUNCATED",
        signal: params.signal,
      });

      await fsp.rename(tempPath, cachePath).catch(async (err) => {
        await fsp.rm(tempPath, { force: true }).catch(() => {});
        throw err;
      });
      await pruneStreamCacheIfNeeded();
      recordStreamCacheAccess({ cacheType: "range", outcome: "filled" });
      observeStreamCacheFill({
        cacheType: "range",
        durationMs: Date.now() - fillStartedAt,
      });
      return cachePath;
    } finally {
      releaseReservation();
      releaseFillSlot();
    }
  })().finally(() => {
    inFlightRangeFill.delete(rangeKey);
  });

  inFlightRangeFill.set(rangeKey, fillPromise);
  return fillPromise;
}

export function createCachedReadStream(params: {
  filePath: string;
  start: number;
  end: number;
}) {
  return fs.createReadStream(params.filePath, {
    start: params.start,
    end: params.end,
  });
}

async function acquireCacheFillSlot(): Promise<() => void> {
  const streamCacheFillConcurrency = getStreamCacheFillConcurrency();
  if (
    !Number.isFinite(streamCacheFillConcurrency) ||
    streamCacheFillConcurrency <= 0
  ) {
    return () => {};
  }

  while (activeCacheFills >= streamCacheFillConcurrency) {
    await new Promise<void>((resolve) => pendingFillWaiters.push(resolve));
  }
  activeCacheFills += 1;
  setStreamCacheMetrics({ activeFills: activeCacheFills, reservedBytes: reservedCacheBytes });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeCacheFills = Math.max(0, activeCacheFills - 1);
    setStreamCacheMetrics({ activeFills: activeCacheFills, reservedBytes: reservedCacheBytes });
    pendingFillWaiters.shift()?.();
  };
}

async function reserveCacheBytes(expectedBytes: number): Promise<null | (() => void)> {
  const streamCacheMaxBytes = getStreamCacheMaxBytes();
  if (!Number.isFinite(streamCacheMaxBytes) || streamCacheMaxBytes <= 0) {
    return () => {};
  }
  if (expectedBytes > streamCacheMaxBytes) {
    return null;
  }

  return withCacheReservationLock(async () => {
    await pruneStreamCacheIfNeeded();
    const files = await listCacheFiles();
    const currentBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (currentBytes + reservedCacheBytes + expectedBytes > streamCacheMaxBytes) {
      return null;
    }

    reservedCacheBytes += expectedBytes;
    setStreamCacheMetrics({ activeFills: activeCacheFills, reservedBytes: reservedCacheBytes });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      reservedCacheBytes = Math.max(0, reservedCacheBytes - expectedBytes);
      setStreamCacheMetrics({ activeFills: activeCacheFills, reservedBytes: reservedCacheBytes });
    };
  });
}

async function withCacheReservationLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = cacheReservationLock;
  let release!: () => void;
  cacheReservationLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
