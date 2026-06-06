import { WalrusReadLimits } from "../../config/walrus.config.js";

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  return Number(raw === undefined || raw === "" ? fallback : raw);
}

export function getStreamCacheTtlMs(): number {
  return readNumberEnv("FLOE_STREAM_CACHE_TTL_MS", 30 * 60_000);
}

export function getStreamCacheMaxBytes(): number {
  return readNumberEnv("FLOE_STREAM_CACHE_MAX_BYTES", 2 * 1024 * 1024 * 1024);
}

export function getStreamCacheFillConcurrency(): number {
  return readNumberEnv("FLOE_STREAM_CACHE_FILL_CONCURRENCY", 4);
}

export function shouldCacheFullObject(sizeBytes: number): boolean {
  return (
    Number.isFinite(sizeBytes) &&
    sizeBytes > 0 &&
    sizeBytes <= WalrusReadLimits.inlineFullObjectMaxBytes
  );
}
