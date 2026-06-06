import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.WALRUS_AGGREGATOR_URL = "http://127.0.0.1:1";
process.env.UPLOAD_TMP_DIR = path.join(os.tmpdir(), `floe-stream-reader-${process.pid}`);

const {
  readCachedSegmentByteStream,
  readWalrusByteStream,
  readWalrusByteStreamAndCache,
} = await import(
  "../src/services/stream/stream.reader.ts"
);
const { writeWebBodyToFile } = await import("../src/services/stream/stream.cache.io.ts");

async function makeTempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), `floe-stream-reader-${process.pid}-`));
}

async function collectBytes(stream: AsyncIterable<Uint8Array>) {
  const out: number[] = [];
  for await (const chunk of stream) {
    out.push(...chunk);
  }
  return out;
}

test("readWalrusByteStream yields upstream bytes for a full segment", async () => {
  const bytes = Uint8Array.from([1, 2, 3, 4]);

  const output = await collectBytes(
    readWalrusByteStream({
      blobId: "blob-1",
      start: 0,
      end: 3,
      maxSegmentBytes: 4,
      signal: new AbortController().signal,
      fetchBlob: async () => ({
        res: new Response(bytes, { status: 206 }),
      }) as any,
    })
  );

  assert.deepEqual(output, [1, 2, 3, 4]);
});

test("readWalrusByteStreamAndCache streams once and persists the cache file", async () => {
  const root = await makeTempDir();
  const cachePath = path.join(root, "blob.cache");
  let fetchCount = 0;

  const output = await collectBytes(
    readWalrusByteStreamAndCache({
      blobId: "blob-1",
      start: 0,
      end: 3,
      maxSegmentBytes: 4,
      cachePath,
      signal: new AbortController().signal,
      fetchBlob: async () => {
        fetchCount += 1;
        return {
          res: new Response(Uint8Array.from([1, 2, 3, 4]), { status: 206 }),
        };
      },
    }) as AsyncIterable<Uint8Array>
  );

  assert.equal(fetchCount, 1);
  assert.deepEqual(output, [1, 2, 3, 4]);
  assert.deepEqual([...await fsp.readFile(cachePath)], [1, 2, 3, 4]);
  await fsp.rm(root, { recursive: true, force: true });
});

test("writeWebBodyToFile aborts cleanly without leaving the temp file behind", async () => {
  const root = await makeTempDir();
  const tempPath = path.join(root, "body.tmp");
  const controller = new AbortController();

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      streamController.enqueue(Uint8Array.from([1, 2, 3, 4]));
      const timer = setTimeout(() => {
        if (controller.signal.aborted) return;
        streamController.enqueue(Uint8Array.from([5, 6, 7, 8]));
        streamController.close();
      }, 25);
      controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          streamController.close();
        },
        { once: true }
      );
      setTimeout(() => {
        controller.abort();
      }, 5);
    },
  });

  await assert.rejects(
    writeWebBodyToFile({
      body,
      tempPath,
      expectedBytes: 8,
      truncationErrorPrefix: "STREAM_CACHE_FULL_TRUNCATED",
      signal: controller.signal,
    }),
    (err: unknown) => (err as Error)?.name === "AbortError"
  );

  assert.equal(await fsp.stat(tempPath).catch(() => null), null);
  await fsp.rm(root, { recursive: true, force: true });
});

test("readWalrusByteStreamAndCache aborts cleanly after the first chunk", async () => {
  const root = await makeTempDir();
  const cachePath = path.join(root, "blob.cache");
  const controller = new AbortController();

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      streamController.enqueue(Uint8Array.from([1, 2, 3, 4]));
      const timer = setTimeout(() => {
        if (controller.signal.aborted) return;
        streamController.enqueue(Uint8Array.from([5, 6, 7, 8]));
        streamController.close();
      }, 25);
      controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          streamController.close();
        },
        { once: true }
      );
    },
  });

  const iterator = readWalrusByteStreamAndCache({
    blobId: "blob-abort",
    start: 0,
    end: 7,
    maxSegmentBytes: 8,
    cachePath,
    signal: controller.signal,
    fetchBlob: async () => ({
      res: new Response(body, { status: 206 }),
    }),
  })[Symbol.asyncIterator]();

  const first = await iterator.next();
  assert.equal(first.done, false);
  assert.deepEqual([...first.value], [1, 2, 3, 4]);

  controller.abort();

  await assert.rejects(
    () => iterator.next(),
    (err: unknown) => (err as Error)?.name === "AbortError"
  );

  assert.equal(await fsp.stat(cachePath).catch(() => null), null);
  await fsp.rm(root, { recursive: true, force: true });
});

test("readCachedSegmentByteStream reads cached bytes when cache is available", async () => {
  const root = await makeTempDir();
  const filePath = path.join(root, "segment.part");
  await fsp.writeFile(filePath, Buffer.from([5, 6, 7, 8]));

  const output = await collectBytes(
    readCachedSegmentByteStream({
      blobId: "blob-2",
      start: 0,
      end: 3,
      initialSegmentBytes: 4,
      segmentBytes: 4,
      signal: new AbortController().signal,
      ensureRange: async () => filePath,
      createReadStream: (params) =>
        fs.createReadStream(params.filePath, {
          start: params.start,
          end: params.end,
        }),
    })
  );

  assert.deepEqual(output, [5, 6, 7, 8]);
  await fsp.rm(root, { recursive: true, force: true });
});

test("readCachedSegmentByteStream falls back to walrus bytes when cache is full", async () => {
  const output = await collectBytes(
    readCachedSegmentByteStream({
      blobId: "blob-3",
      start: 0,
      end: 1,
      initialSegmentBytes: 2,
      segmentBytes: 2,
      signal: new AbortController().signal,
      ensureRange: async () => {
        throw new Error("STREAM_CACHE_CAPACITY_EXCEEDED");
      },
      readWalrusByteStream: async function* () {
        yield Uint8Array.from([9, 10]);
      },
    })
  );

  assert.deepEqual(output, [9, 10]);
});
