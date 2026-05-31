import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUploadActionFingerprint,
  parseUploadActionIdempotencyRecord,
  shapeUploadActionIdempotencyRecord,
} from "../src/services/uploads/upload.action.idempotency.ts";

test("buildUploadActionFingerprint is stable for identical payloads", () => {
  const payload = {
    subject: "user:123",
    action: "complete",
    uploadId: "11111111-1111-1111-1111-111111111111",
    includeBlobId: true,
  };

  const first = buildUploadActionFingerprint(payload);
  const second = buildUploadActionFingerprint(payload);

  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("shapeUploadActionIdempotencyRecord serializes replay metadata for Redis", () => {
  assert.deepEqual(
    shapeUploadActionIdempotencyRecord({
      fingerprint: "abc123",
      statusCode: 202,
      responseBody: { ok: true, status: "finalizing" },
      retryAfter: "2",
    }),
    {
      fingerprint: "abc123",
      statusCode: "202",
      responseBody: JSON.stringify({ ok: true, status: "finalizing" }),
      retryAfter: "2",
    }
  );
});

test("parseUploadActionIdempotencyRecord rejects corrupt Redis payloads", () => {
  assert.equal(parseUploadActionIdempotencyRecord(null), null);
  assert.throws(
    () =>
      parseUploadActionIdempotencyRecord({
        fingerprint: "abc123",
        statusCode: "202",
        responseBody: "{",
      }),
    /CORRUPT_UPLOAD_ACTION_IDEMPOTENCY_RECORD/
  );
  assert.throws(
    () =>
      parseUploadActionIdempotencyRecord({
        fingerprint: "abc123",
        statusCode: "199",
        responseBody: JSON.stringify({ ok: true }),
      }),
    /CORRUPT_UPLOAD_ACTION_IDEMPOTENCY_RECORD/
  );
});
