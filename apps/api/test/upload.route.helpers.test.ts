import test from "node:test";
import assert from "node:assert/strict";

import {
  getUploadIdempotencyKey,
  shouldExposeBlobId,
  shouldExposeWalrusDebug,
  uploadAuthzErrorCode,
  uploadAuthzStatusCode,
} from "../src/services/uploads/upload.route.helpers.ts";

test("getUploadIdempotencyKey trims and bounds the request header", () => {
  assert.equal(getUploadIdempotencyKey({ headers: {} }), null);
  assert.equal(getUploadIdempotencyKey({ headers: { "idempotency-key": "   " } }), null);
  assert.equal(getUploadIdempotencyKey({ headers: { "idempotency-key": "abc" } }), "abc");
  assert.equal(
    getUploadIdempotencyKey({
      headers: { "idempotency-key": ` ${"x".repeat(256)} ` },
    }),
    "x".repeat(256)
  );
  assert.equal(
    getUploadIdempotencyKey({
      headers: { "idempotency-key": "x".repeat(257) },
    }),
    null
  );
});

test("shouldExposeBlobId and shouldExposeWalrusDebug honor the supported query aliases", () => {
  assert.equal(shouldExposeBlobId({ includeBlobId: "true" }), true);
  assert.equal(shouldExposeBlobId({ include_blob_id: "1" }), true);
  assert.equal(shouldExposeBlobId({ includeStorage: true }), true);
  assert.equal(shouldExposeBlobId({}), false);

  assert.equal(shouldExposeWalrusDebug({ debug: "true" }), true);
  assert.equal(shouldExposeWalrusDebug({ includeDebug: "1" }), true);
  assert.equal(shouldExposeWalrusDebug({ includeWalrusDebug: true }), true);
  assert.equal(shouldExposeWalrusDebug({}), false);
});

test("upload authz helpers map auth failures to HTTP errors", () => {
  assert.equal(uploadAuthzStatusCode("AUTH_REQUIRED"), 401);
  assert.equal(uploadAuthzStatusCode("OWNER_MISMATCH"), 403);
  assert.equal(uploadAuthzStatusCode("INSUFFICIENT_SCOPE"), 403);

  assert.equal(uploadAuthzErrorCode("AUTH_REQUIRED"), "AUTH_REQUIRED");
  assert.equal(uploadAuthzErrorCode("INSUFFICIENT_SCOPE"), "INSUFFICIENT_SCOPE");
  assert.equal(uploadAuthzErrorCode("OWNER_MISMATCH"), "OWNER_MISMATCH");
  assert.equal(uploadAuthzErrorCode(undefined), "OWNER_MISMATCH");
});
