import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCreateUploadFingerprint,
  parseCreateIdempotencyRecord,
  shapeCreateIdempotencyRecord,
  sendCreateIdempotencyReplay,
} from "../src/services/uploads/upload.create.idempotency.ts";

test("buildCreateUploadFingerprint is stable for identical payloads", () => {
  const payload = {
    subject: "user:123",
    filename: "video.mp4",
    contentType: "video/mp4",
    sizeBytes: 8,
    chunkSize: 4,
    epochs: 2,
  };

  const first = buildCreateUploadFingerprint(payload);
  const second = buildCreateUploadFingerprint(payload);

  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("shapeCreateIdempotencyRecord serializes create replay metadata for Redis", () => {
  assert.deepEqual(
    shapeCreateIdempotencyRecord({
      fingerprint: "abc123",
      uploadId: "upload-1",
      chunkSize: 4,
      totalChunks: 2,
      epochs: 3,
      expiresAt: 1234567890,
    }),
    {
      fingerprint: "abc123",
      uploadId: "upload-1",
      chunkSize: "4",
      totalChunks: "2",
      epochs: "3",
      expiresAt: "1234567890",
    }
  );
});

test("parseCreateIdempotencyRecord rejects corrupt Redis payloads", () => {
  assert.equal(parseCreateIdempotencyRecord(null), null);
  assert.throws(
    () =>
      parseCreateIdempotencyRecord({
        fingerprint: "abc123",
        uploadId: "upload-1",
        chunkSize: "4",
        totalChunks: "two",
        epochs: "3",
        expiresAt: "1234567890",
      }),
    /CORRUPT_CREATE_IDEMPOTENCY_RECORD/
  );
});

test("sendCreateIdempotencyReplay replays matching payloads", async () => {
  const redis = {
    hgetall: async () => ({
      fingerprint: "abc123",
      uploadId: "upload-1",
      chunkSize: "4",
      totalChunks: "2",
      epochs: "3",
      expiresAt: "1234567890",
    }),
  };
  const reply = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: null as unknown,
    header(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
  };

  const outcome = await sendCreateIdempotencyReplay({
    reply,
    redis: redis as any,
    key: "idempotency-key",
    fingerprint: "abc123",
  });

  assert.equal(outcome, "replayed");
  assert.equal(reply.headers["Idempotency-Replayed"], "true");
  assert.equal(reply.statusCode, 201);
  assert.deepEqual(reply.body, {
    uploadId: "upload-1",
    chunkSize: 4,
    totalChunks: 2,
    epochs: 3,
    expiresAt: 1234567890,
  });
});
