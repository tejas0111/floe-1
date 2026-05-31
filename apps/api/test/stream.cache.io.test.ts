import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ReadableStream } from "node:stream/web";

import { writeWebBodyToFile } from "../src/services/stream/stream.cache.io.ts";

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), `floe-stream-cache-io-${process.pid}-`));
}

function makeBody(bytes: number[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.from(bytes));
      controller.close();
    },
  });
}

test("writeWebBodyToFile writes the expected byte count", async () => {
  const root = await makeTempDir();
  const tempPath = path.join(root, "payload.tmp");

  const written = await writeWebBodyToFile({
    body: makeBody([1, 2, 3, 4]),
    tempPath,
    expectedBytes: 4,
    truncationErrorPrefix: "STREAM_CACHE_FULL_TRUNCATED",
  });

  assert.equal(written, 4);
  assert.deepEqual(new Uint8Array(await fs.readFile(tempPath)), Uint8Array.from([1, 2, 3, 4]));
  await fs.rm(root, { recursive: true, force: true });
});

test("writeWebBodyToFile removes the temp file on truncation", async () => {
  const root = await makeTempDir();
  const tempPath = path.join(root, "payload.tmp");

  await assert.rejects(
    writeWebBodyToFile({
      body: makeBody([1, 2]),
      tempPath,
      expectedBytes: 4,
      truncationErrorPrefix: "STREAM_CACHE_RANGE_TRUNCATED",
    }),
    /STREAM_CACHE_RANGE_TRUNCATED expected=4 read=2/
  );

  assert.equal(await fs.stat(tempPath).catch(() => null), null);
  await fs.rm(root, { recursive: true, force: true });
});
