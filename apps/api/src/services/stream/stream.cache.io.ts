import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";

export async function writeWebBodyToFile(params: {
  body: ReadableStream<Uint8Array>;
  tempPath: string;
  expectedBytes: number;
  truncationErrorPrefix: string;
}): Promise<number> {
  let bytesWritten = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(params.tempPath, { flags: "wx" });
      const rs = Readable.fromWeb(params.body as any);
      rs.on("data", (chunk: Uint8Array) => {
        bytesWritten += chunk.byteLength;
      });
      rs.once("error", reject);
      ws.once("error", reject);
      ws.once("finish", resolve);
      rs.pipe(ws);
    });
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
