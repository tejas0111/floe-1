import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

export async function writeWebBodyToFile(params: {
  body: ReadableStream<Uint8Array>;
  tempPath: string;
  expectedBytes: number;
  truncationErrorPrefix: string;
  signal?: AbortSignal;
}): Promise<number> {
  let bytesWritten = 0;

  try {
    const ws = fs.createWriteStream(params.tempPath, { flags: "wx" });
    const counter = new Transform({
      transform(chunk: Uint8Array, _encoding, callback) {
        bytesWritten += chunk.byteLength;
        callback(null, chunk);
      },
    });

    const source = Readable.fromWeb(params.body as any);
    await pipeline(source, counter, ws, { signal: params.signal });
  } catch (err) {
    await fsp.rm(params.tempPath, { force: true }).catch(() => {});
    throw err;
  }

  if (bytesWritten !== params.expectedBytes) {
    await fsp.rm(params.tempPath, { force: true }).catch(() => {});
    throw new Error(
      `${params.truncationErrorPrefix} expected=${params.expectedBytes} read=${bytesWritten}`
    );
  }

  return bytesWritten;
}
