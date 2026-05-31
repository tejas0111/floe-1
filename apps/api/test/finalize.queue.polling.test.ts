import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

process.env.UPLOAD_TMP_DIR = path.join(os.tmpdir(), `floe-finalize-queue-${process.pid}`);
process.env.FLOE_CHUNK_STORE_MODE = "disk";

const { setRedisForTests } = await import("../src/state/redis.ts");
const { finalizeQueueTestHooks, startUploadFinalizeWorker, stopUploadFinalizeWorker } = await import(
  "../src/services/uploads/finalize.queue.ts"
);

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

let originalRedis: any = null;

function makeIdleRedisStub() {
  const calls = {
    smembers: 0,
    rpop: 0,
  };

  const redis = {
    smembers: async () => {
      calls.smembers += 1;
      return [];
    },
    rpop: async () => {
      calls.rpop += 1;
      return null;
    },
    hgetall: async () => ({}),
    hget: async () => null,
    hincrby: async () => 1,
    hset: async () => "OK",
    srem: async () => 0,
    zrem: async () => 0,
    eval: async () => 0,
    ttl: async () => -2,
    set: async () => "OK",
    del: async () => 0,
    close: async () => {},
  } as any;

  return { redis, calls };
}

function makeSingleJobRedisStub() {
  const calls = {
    smembers: 0,
    rpop: 0,
  };
  const queue = ["upload-1"];

  const redis = {
    smembers: async () => {
      calls.smembers += 1;
      return [];
    },
    rpop: async () => {
      calls.rpop += 1;
      return queue.pop() ?? null;
    },
    hgetall: async () => ({}),
    hget: async () => null,
    hincrby: async () => 1,
    hset: async () => "OK",
    srem: async () => 0,
    zrem: async () => 0,
    eval: async (_script: string, keys: string[], argv: string[]) => {
      const uploadId = argv[0];
      if (!uploadId) return 0;
      if (keys.length >= 2) {
        queue.unshift(uploadId);
      }
      return 1;
    },
    ttl: async () => -2,
    set: async () => "OK",
    del: async () => 0,
    close: async () => {},
  } as any;

  return { redis, calls };
}

afterEach(async () => {
  await stopUploadFinalizeWorker().catch(() => {});
  setRedisForTests(originalRedis);
  finalizeQueueTestHooks.reset();
});

test("finalize worker does not poll redis on an idle queue", async () => {
  const { redis, calls } = makeIdleRedisStub();
  setRedisForTests(redis);
  finalizeQueueTestHooks.reset();

  await startUploadFinalizeWorker(log);
  assert.equal(calls.rpop, 1);

  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(calls.rpop, 1);
  assert.equal(calls.smembers, 1);
});

test("finalize worker stops polling after the queue drains", async () => {
  const { redis, calls } = makeSingleJobRedisStub();
  setRedisForTests(redis);
  finalizeQueueTestHooks.reset();
  finalizeQueueTestHooks.setProcessFinalize(async () => {});

  await startUploadFinalizeWorker(log);

  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(calls.rpop, 2);
});
