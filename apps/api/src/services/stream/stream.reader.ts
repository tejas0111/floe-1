import fs from "node:fs";
import fsp from "node:fs/promises";
import { finished } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

import { fetchWalrusBlob } from "../walrus/read.js";
import {
  createCachedReadStream,
  ensureCachedStreamRange,
} from "./stream.cache.js";

function safeUpstreamSnippet(body: string): string {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return "";
  const snippet = trimmed.slice(0, 160);
  return snippet.replace(/[^\x20-\x7E]/g, "");
}

function makeWalrusReadError(upstreamStatus: number, upstreamBody: string) {
  const snippet = safeUpstreamSnippet(upstreamBody);
  const err = new Error(
    `WALRUS_RANGE_FAILED status=${upstreamStatus}${snippet ? ` body=${snippet}` : ""}`.trim()
  ) as Error & { statusCode?: number };

  if (upstreamStatus === 404) {
    err.statusCode = 404;
    err.message = "FILE_BLOB_UNAVAILABLE";
    return err;
  }

  err.statusCode = upstreamStatus >= 500 ? 503 : 502;
  return err;
}

export async function* readWalrusByteStream(params: {
  blobId: string;
  start: number;
  end: number;
  maxSegmentBytes: number;
  initialSegmentBytes?: number;
  signal: AbortSignal;
  fetchBlob?: typeof fetchWalrusBlob;
}): AsyncGenerator<Uint8Array> {
  const fetchBlob = params.fetchBlob ?? fetchWalrusBlob;
  const maxSegmentBytes =
    Number.isFinite(params.maxSegmentBytes) && params.maxSegmentBytes > 0
      ? params.maxSegmentBytes
      : 16 * 1024 * 1024;

  const minSegmentBytes = 256 * 1024;
  let offset = params.start;

  while (offset <= params.end) {
    if (params.signal.aborted) return;

    const preferredSegmentBytes =
      offset === params.start && params.initialSegmentBytes
        ? Math.max(maxSegmentBytes, params.initialSegmentBytes)
        : maxSegmentBytes;
    let segSize = Math.min(preferredSegmentBytes, params.end - offset + 1);

    while (true) {
      const segEnd = Math.min(params.end, offset + segSize - 1);

      let upstream: Response;
      try {
        ({ res: upstream } = await fetchBlob({
          blobId: params.blobId,
          rangeHeader: `bytes=${offset}-${segEnd}`,
          signal: params.signal,
        }));
      } catch (err) {
        if (params.signal.aborted || (err as any)?.name === "AbortError") {
          return;
        }

        if (segSize > minSegmentBytes) {
          segSize = Math.max(minSegmentBytes, Math.floor(segSize / 2));
          continue;
        }

        throw err;
      }

      if (upstream.status === 416 && segSize > minSegmentBytes) {
        segSize = Math.max(minSegmentBytes, Math.floor(segSize / 2));
        continue;
      }

      const isFullObjectAttempt =
        params.start === 0 && offset === 0 && segEnd === params.end;

      if (upstream.status === 200 && isFullObjectAttempt) {
      } else if (upstream.status !== 206) {
        const text = await upstream.text().catch(() => "");
        throw makeWalrusReadError(upstream.status, text);
      }

      const body = upstream.body;
      if (!body) {
        throw new Error(`WALRUS_MISSING_BODY status=${upstream.status} offset=${offset} end=${segEnd}`);
      }

      const rs = Readable.fromWeb(body as any);
      const expected = segEnd - offset + 1;
      let read = 0;

      for await (const chunk of rs) {
        if (params.signal.aborted) return;
        const buf = chunk as Uint8Array;
        read += buf.byteLength;
        yield buf;
      }

      if (read < expected) {
        if (read === 0) {
          throw new Error(`WALRUS_EMPTY_SEGMENT offset=${offset} end=${segEnd}`);
        }

        offset += read;
        segSize = Math.max(minSegmentBytes, Math.floor(segSize / 2));
        continue;
      }

      if (read > expected) {
        throw new Error(`WALRUS_SEGMENT_OVERRUN expected=${expected} read=${read}`);
      }

      offset = segEnd + 1;
      break;
    }
  }
}

export async function* readWalrusByteStreamAndCache(params: {
  blobId: string;
  start: number;
  end: number;
  maxSegmentBytes: number;
  initialSegmentBytes?: number;
  signal: AbortSignal;
  cachePath: string;
  fetchBlob?: typeof fetchWalrusBlob;
}): AsyncGenerator<Uint8Array> {
  const tempPath = `${params.cachePath}.tmp-${process.pid}-${Date.now()}`;
  await fsp.mkdir(path.dirname(params.cachePath), { recursive: true });
  const writeStream = fs.createWriteStream(tempPath, { flags: "w" });
  let writtenBytes = 0;

  try {
    for await (const chunk of readWalrusByteStream(params)) {
      if (params.signal.aborted) {
        return;
      }

      if (!writeStream.write(chunk)) {
        await new Promise<void>((resolve, reject) => {
          writeStream.once("drain", resolve);
          writeStream.once("error", reject);
        });
      }

      writtenBytes += chunk.byteLength;
      yield chunk;
    }

    if (params.signal.aborted) {
      throw Object.assign(new Error("AbortError"), { name: "AbortError" });
    }

    writeStream.end();
    await finished(writeStream);

    const expectedBytes = params.end - params.start + 1;
    if (writtenBytes !== expectedBytes) {
      throw new Error(`WALRUS_CACHE_STREAM_TRUNCATED expected=${expectedBytes} read=${writtenBytes}`);
    }

    await fsp.rename(tempPath, params.cachePath);
  } catch (err) {
    writeStream.destroy();
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw err;
  }
}

export async function* readCachedSegmentByteStream(params: {
  blobId: string;
  start: number;
  end: number;
  initialSegmentBytes: number;
  segmentBytes: number;
  signal: AbortSignal;
  ensureRange?: typeof ensureCachedStreamRange;
  createReadStream?: typeof createCachedReadStream;
  readWalrusByteStream?: typeof readWalrusByteStream;
}): AsyncGenerator<Uint8Array> {
  const ensureRange = params.ensureRange ?? ensureCachedStreamRange;
  const createReadStream = params.createReadStream ?? createCachedReadStream;
  const readWalrus = params.readWalrusByteStream ?? readWalrusByteStream;

  let offset = params.start;

  while (offset <= params.end) {
    if (params.signal.aborted) return;

    const preferredSegmentBytes =
      offset === params.start ? params.initialSegmentBytes : params.segmentBytes;
    const segmentEnd = Math.min(params.end, offset + preferredSegmentBytes - 1);
    const expected = segmentEnd - offset + 1;
    try {
      const cachePath = await ensureRange({
        blobId: params.blobId,
        start: offset,
        end: segmentEnd,
        signal: params.signal,
      });

      const rs = createReadStream({
        filePath: cachePath,
        start: 0,
        end: segmentEnd - offset,
      });

      let read = 0;
      for await (const chunk of rs) {
        if (params.signal.aborted) return;
        const buf = chunk as Uint8Array;
        read += buf.byteLength;
        yield buf;
      }

      if (read !== expected) {
        throw new Error(`STREAM_CACHE_RANGE_TRUNCATED expected=${expected} read=${read}`);
      }
    } catch (err) {
      if ((err as Error)?.message !== "STREAM_CACHE_CAPACITY_EXCEEDED") {
        throw err;
      }

      for await (const chunk of readWalrus({
        blobId: params.blobId,
        start: offset,
        end: segmentEnd,
        maxSegmentBytes: params.segmentBytes,
        initialSegmentBytes: expected,
        signal: params.signal,
      })) {
        yield chunk;
      }
    }

    offset = segmentEnd + 1;
  }
}
