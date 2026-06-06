import test from "node:test";
import assert from "node:assert/strict";

import { classifyWalrusRenewFailure } from "../src/services/walrus/renew.failure.ts";

test("classifyWalrusRenewFailure flags outdated clients", () => {
  const result = classifyWalrusRenewFailure(
    "WALRUS_RENEW_FAILED:\u001b[2m2026-06-04T16:48:03.961208Z\u001b[0m \u001b[33m WARN\u001b[0m \u001b[2mwalrus\u001b[0m\u001b[2m:\u001b[0m This build of the Walrus client is older than 30 days. Please update to the latest version."
  );

  assert.deepEqual(result, {
    statusCode: 503,
    code: "DEPENDENCY_UNAVAILABLE",
    message: "Walrus CLI is outdated. Update the Walrus client and retry.",
    retryable: true,
  });
});

test("classifyWalrusRenewFailure flags missing walrus input objects", () => {
  const result = classifyWalrusRenewFailure(
    'WALRUS_RENEW_FAILED:The following input objects are invalid: {"code":"notExists","object_id":"0x123"}'
  );

  assert.deepEqual(result, {
    statusCode: 404,
    code: "FILE_BLOB_UNAVAILABLE",
    message:
      "Walrus blob object is no longer available. Renew cannot proceed until the asset is re-certified.",
    retryable: false,
  });
});
