import test from "node:test";
import assert from "node:assert/strict";

import {
  authzErrorCode,
  authzStatusCode,
  shouldExposeBlobId,
  shouldExposeWalrusDebug,
} from "../src/services/http/route.helpers.ts";

test("shared authz helpers map route authorization failures consistently", () => {
  assert.equal(authzStatusCode("AUTH_REQUIRED"), 401);
  assert.equal(authzStatusCode("OWNER_MISMATCH"), 403);
  assert.equal(authzStatusCode("INSUFFICIENT_SCOPE"), 403);

  assert.equal(authzErrorCode("AUTH_REQUIRED"), "AUTH_REQUIRED");
  assert.equal(authzErrorCode("INSUFFICIENT_SCOPE"), "INSUFFICIENT_SCOPE");
  assert.equal(authzErrorCode("OWNER_MISMATCH"), "OWNER_MISMATCH");
});

test("shared exposure helpers honor the supported query aliases", () => {
  assert.equal(shouldExposeBlobId({ includeBlobId: "true" }), true);
  assert.equal(shouldExposeBlobId({ include_blob_id: "1" }), true);
  assert.equal(shouldExposeBlobId({ includeStorage: true }), true);
  assert.equal(shouldExposeBlobId({}), false);

  assert.equal(shouldExposeWalrusDebug({ debug: "true" }), true);
  assert.equal(shouldExposeWalrusDebug({ includeDebug: "1" }), true);
  assert.equal(shouldExposeWalrusDebug({ includeWalrusDebug: true }), true);
  assert.equal(shouldExposeWalrusDebug({}), false);
});
