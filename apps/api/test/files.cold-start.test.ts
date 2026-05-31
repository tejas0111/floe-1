import test, { before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

process.env.FLOE_NETWORK = "testnet";
process.env.SUI_PRIVATE_KEY = `[${new Array(32).fill(0).join(",")}]`;
process.env.SUI_PACKAGE_ID = "0x2";
process.env.WALRUS_AGGREGATOR_URL = "http://127.0.0.1:1";
process.env.UPLOAD_TMP_DIR = path.join(os.tmpdir(), `floe-cold-start-${process.pid}`);
process.env.FLOE_PUBLIC_STREAM_BASE_URL = "";
delete process.env.DATABASE_URL;

type FilesRouteModule = typeof import("../src/routes/files.ts");
type SuiModule = typeof import("../src/state/sui.ts");

let filesRouteModule: FilesRouteModule;
let suiModule: SuiModule;
let originalGetObject: typeof suiModule.suiClient.getObject;

const log = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  trace() {},
  fatal() {},
  child() {
    return this;
  },
} as any;

async function createRouteApp() {
  const handlers = new Map<string, (req: any, reply: any) => Promise<unknown> | unknown>();
  const app = {
    get(path: string, handler: (req: any, reply: any) => Promise<unknown> | unknown) {
      handlers.set(`GET ${path}`, handler);
    },
    post(path: string, handler: (req: any, reply: any) => Promise<unknown> | unknown) {
      handlers.set(`POST ${path}`, handler);
    },
    route(definition: { method: string[]; url: string; handler: (req: any, reply: any) => Promise<unknown> | unknown }) {
      for (const method of definition.method) {
        handlers.set(`${method} ${definition.url}`, definition.handler);
      }
    },
  } as any;

  await filesRouteModule.filesRoutes(app);

  return {
    async inject(params: {
      method: "GET";
      url: string;
      routePath?: string;
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
    }) {
      const routePath = params.routePath ?? params.url;
      const handler = handlers.get(`${params.method} ${routePath}`);
      if (!handler) {
        throw new Error(`Route not registered: ${params.method} ${routePath}`);
      }
      const reply = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        payload: undefined as unknown,
        raw: {
          once() {},
          removeListener() {},
        },
        code(statusCode: number) {
          this.statusCode = statusCode;
          return this;
        },
        status(statusCode: number) {
          this.statusCode = statusCode;
          return this;
        },
        header(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        },
        send(payload?: unknown) {
          this.payload = payload;
          return this;
        },
      };
      const req = {
        method: params.method,
        params: params.params ?? {},
        query: {},
        headers: params.headers ?? {},
        log,
        server: {
          authProvider: {
            async authorizeFileAccess() {
              return { allowed: true };
            },
            async checkRateLimit() {
              return {
                allowed: true,
                current: 1,
                limit: 1000,
                windowSeconds: 60,
                identity: {
                  authenticated: false,
                  subject: "integration-test",
                  method: "public",
                  owner: null,
                },
              };
            },
          },
        },
        raw: {
          once() {},
          removeListener() {},
        },
      };
      const result = await handler(req, reply);
      const payload = reply.payload !== undefined ? reply.payload : result;
      return {
        statusCode: reply.statusCode,
        headers: reply.headers,
        payload,
      };
    },
  };
}

async function mockSuiFile(blobId: string, sizeBytes: number) {
  (suiModule.suiClient as any).getObject = async () => ({
    data: {
      type: "0x2::file::FileMeta",
      content: {
        dataType: "moveObject",
        fields: {
          blob_id: blobId,
          size_bytes: String(sizeBytes),
          mime: "video/mp4",
          created_at: "1700000000000",
          owner: "0x1111111111111111111111111111111111111111111111111111111111111111",
          walrus_end_epoch: "12",
        },
      },
    },
  });
}

before(async () => {
  filesRouteModule = await import("../src/routes/files.ts");
  suiModule = await import("../src/state/sui.ts");
  originalGetObject = suiModule.suiClient.getObject.bind(suiModule.suiClient);
});

test("stream route does not wait for full cache warmup on a cold read", async () => {
  const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const rangeHeader =
          input instanceof Request
            ? input.headers.get("range")
            : new Headers(init?.headers ?? undefined).get("range");

        if (requestUrl.includes("/v1/blobs/") && rangeHeader === "bytes=0-15") {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(Uint8Array.from([0, 1, 2, 3]));
            },
          }),
          { status: 206 }
        );
        }

        return new Response(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), {
          status: rangeHeader ? 206 : 200,
        });
    }) as typeof fetch;

    await mockSuiFile("blob-cold-full", 16);
    const app = await createRouteApp();
    const fileId = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    let coldStartTimeout: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        app.inject({
          method: "GET",
          url: `/v1/files/${fileId}/stream`,
          routePath: "/v1/files/:fileId/stream",
          params: { fileId },
        }),
        new Promise<never>((_, reject) => {
          coldStartTimeout = setTimeout(() => reject(new Error("STREAM_COLD_START_BLOCKED")), 250);
        }),
      ]);
      if (coldStartTimeout) clearTimeout(coldStartTimeout);

      assert.equal(result.statusCode, 200);
      assert.ok(result.payload);

      let firstByteTimeout: NodeJS.Timeout | undefined;
      const firstChunk = await Promise.race([
        (async () => {
          if (!(result.payload instanceof Readable)) {
            throw new Error("Expected stream payload");
          }
          const iterator = result.payload[Symbol.asyncIterator]();
          const next = await iterator.next();
          await iterator.return?.();
          return next;
        })(),
        new Promise<never>((_, reject) => {
          firstByteTimeout = setTimeout(() => reject(new Error("STREAM_FIRST_BYTE_BLOCKED")), 250);
        }),
      ]);
      if (firstByteTimeout) clearTimeout(firstByteTimeout);

      assert.equal(firstChunk.done, false);
      assert.ok(firstChunk.value instanceof Buffer || firstChunk.value instanceof Uint8Array);
    } finally {
      if (coldStartTimeout) clearTimeout(coldStartTimeout);
    }
  } finally {
    globalThis.fetch = originalFetch;
    (suiModule.suiClient as any).getObject = originalGetObject;
    await fs.rm(process.env.UPLOAD_TMP_DIR!, { recursive: true, force: true });
  }
});
