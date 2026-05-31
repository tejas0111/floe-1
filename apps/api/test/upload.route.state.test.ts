import test from "node:test";
import assert from "node:assert/strict";

import { loadUploadStateSnapshot } from "../src/services/uploads/upload.route.helpers.ts";

test("loadUploadStateSnapshot loads session and meta without refreshing when not expired", async () => {
  const calls: string[] = [];
  const redis = {
    hgetall: async () => {
      calls.push("hgetall");
      return { status: "uploading", owner: "owner-1" };
    },
  };

  const snapshot = await loadUploadStateSnapshot({
    redis: redis as any,
    uploadId: "upload-1",
    getSession: async () => {
      calls.push("getSession");
      return { uploadId: "upload-1", owner: "owner-1", expiresAt: 2000 };
    },
    expireUploadIfNeeded: async () => {
      calls.push("expire");
      return false;
    },
  });

  assert.deepEqual(snapshot, {
    session: { uploadId: "upload-1", owner: "owner-1", expiresAt: 2000 },
    meta: { status: "uploading", owner: "owner-1" },
    currentMeta: { status: "uploading", owner: "owner-1" },
    expired: false,
  });
  assert.deepEqual(calls, ["getSession", "hgetall", "expire"]);
});

test("loadUploadStateSnapshot refreshes meta when expireUploadIfNeeded marks the upload expired", async () => {
  const calls: string[] = [];
  let hgetallCalls = 0;
  const redis = {
    hgetall: async () => {
      calls.push("hgetall");
      hgetallCalls += 1;
      if (hgetallCalls === 2) {
        return { status: "expired", expiredAt: "1234" };
      }
      return { status: "uploading", owner: "owner-1" };
    },
  };

  const snapshot = await loadUploadStateSnapshot({
    redis: redis as any,
    uploadId: "upload-1",
    getSession: async () => {
      calls.push("getSession");
      return { uploadId: "upload-1", owner: "owner-1", expiresAt: 2000 };
    },
    expireUploadIfNeeded: async () => {
      calls.push("expire");
      return true;
    },
  });

  assert.deepEqual(snapshot, {
    session: { uploadId: "upload-1", owner: "owner-1", expiresAt: 2000 },
    meta: { status: "uploading", owner: "owner-1" },
    currentMeta: { status: "expired", expiredAt: "1234" },
    expired: true,
  });
  assert.deepEqual(calls, ["getSession", "hgetall", "expire", "hgetall"]);
});
