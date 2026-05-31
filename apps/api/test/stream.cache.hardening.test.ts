import test, { afterEach, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

process.env.FLOE_NETWORK = "testnet";
process.env.SUI_PRIVATE_KEY = `[${new Array(32).fill(0).join(",")}]`;
process.env.SUI_PACKAGE_ID = "0x2";

type StreamCacheModule = typeof import("../src/services/stream/stream.cache.ts");
type FilesRouteModule = typeof import("../src/routes/files.ts");
type MetricsModule = typeof import("../src/services/metrics/runtime.metrics.ts");
type SuiModule = typeof import("../src/state/sui.ts");
type PostgresModule = typeof import("../src/state/postgres.ts");

let streamCacheModule: StreamCacheModule;
let filesRouteModule: FilesRouteModule;
let metricsModule: MetricsModule;
let suiModule: SuiModule;
let postgresModule: PostgresModule;
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

function makeCacheRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), `floe-stream-cache-${process.pid}-`));
}

function parseMetricCount(metrics: string, metricName: string, labelFragment: string) {
  const line = metrics
    .split("\n")
    .find((entry) => entry.startsWith(`${metricName}{${labelFragment}} `));
  if (!line) return 0;
  return Number(line.split(" ").pop());
}

async function readPayloadBytes(payload: unknown): Promise<number[]> {
  if (!(payload instanceof Readable)) {
    return [];
  }

  const chunks: number[] = [];
  for await (const chunk of payload) {
    chunks.push(...chunk);
  }
  return chunks;
}

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
      method: "GET" | "HEAD";
      url: string;
      routePath?: string;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
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
        query: params.query ?? {},
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
        json() {
          return payload;
        },
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
  streamCacheModule = await import("../src/services/stream/stream.cache.ts");
  filesRouteModule = await import("../src/routes/files.ts");
  metricsModule = await import("../src/services/metrics/runtime.metrics.ts");
  postgresModule = await import("../src/state/postgres.ts");
  suiModule = await import("../src/state/sui.ts");
  originalGetObject = suiModule.suiClient.getObject.bind(suiModule.suiClient);
});

afterEach(() => {
  postgresModule.setPostgresForTests(null, false);
  (suiModule.suiClient as any).getObject = originalGetObject;
});

test("initStreamCache ignores temp files when pruning cache entries", async () => {
  const cacheRoot = await makeCacheRoot();
  process.env.UPLOAD_TMP_DIR = cacheRoot;
  process.env.FLOE_STREAM_CACHE_MAX_BYTES = "8";
  process.env.FLOE_STREAM_CACHE_TTL_MS = "1000000";

  const streamCache = await import("../src/services/stream/stream.cache.ts");

  const realPath = path.join(cacheRoot, "_stream_cache", "full", "real-blob.blob");
  const tempPath = path.join(cacheRoot, "_stream_cache", "full", "stale-blob.blob.tmp-123-456");
  await fs.mkdir(path.dirname(realPath), { recursive: true });
  await fs.writeFile(realPath, Buffer.from([0, 1, 2, 3, 4, 5]));
  await fs.writeFile(tempPath, Buffer.from([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
  await fs.utimes(realPath, new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));
  await fs.utimes(tempPath, new Date(), new Date());

  await streamCache.initStreamCache();

  assert.equal(await fs.stat(realPath).catch(() => null) !== null, true);
  assert.equal(await fs.stat(tempPath).catch(() => null), null);
  await fs.rm(cacheRoot, { recursive: true, force: true });
});

test("cached stream responses increment stream ttfb metrics", async () => {
  const cacheRoot = await makeCacheRoot();
  process.env.UPLOAD_TMP_DIR = cacheRoot;
  process.env.FLOE_PUBLIC_STREAM_BASE_URL = "";

  const blobId = "blob-cached-metrics";
  const fileId = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  const cachedPath = path.join(cacheRoot, "_stream_cache", "full", `${blobId}.blob`);
  await fs.mkdir(path.dirname(cachedPath), { recursive: true });
  await fs.writeFile(cachedPath, Buffer.from([0, 1, 2, 3, 4, 5]));
  await mockSuiFile(blobId, 6);

  const before = metricsModule.renderPrometheusMetrics();
  const beforeCount = parseMetricCount(before, "floe_stream_ttfb_ms_count", 'range="full"');

  const app = await createRouteApp();
  const res = await app.inject({
    method: "GET",
    url: `/v1/files/${fileId}/stream`,
    routePath: "/v1/files/:fileId/stream",
    params: { fileId },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(await readPayloadBytes(res.payload), [0, 1, 2, 3, 4, 5]);

  const after = metricsModule.renderPrometheusMetrics();
  const afterCount = parseMetricCount(after, "floe_stream_ttfb_ms_count", 'range="full"');

  assert.equal(afterCount, beforeCount + 1);
  await fs.rm(cacheRoot, { recursive: true, force: true });
});
