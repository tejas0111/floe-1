import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUploadCancelResponse,
  buildUploadCompleteReadyResponse,
  buildUploadCompleteFinalizingResponse,
} from "../src/services/uploads/upload.action.presenter.ts";

test("buildUploadCompleteFinalizingResponse shapes the queued complete response", () => {
  const response = buildUploadCompleteFinalizingResponse({
    uploadId: "11111111-1111-1111-1111-111111111111",
    pollAfterMs: 2000,
    enqueued: true,
    inProgress: true,
    meta: {
      finalizeStage: "walrus_publish",
      finalizeAttemptState: "running",
      finalizeWalrusMs: "17",
    },
  });

  assert.deepEqual(response, {
    uploadId: "11111111-1111-1111-1111-111111111111",
    status: "finalizing",
    pollAfterMs: 2000,
    enqueued: true,
    inProgress: true,
    finalizeStage: "walrus_publish",
    finalizeAttemptState: "running",
    finalizeWalrusMs: 17,
  });
});

test("buildUploadCompleteReadyResponse shapes a completed upload response", () => {
  const response = buildUploadCompleteReadyResponse({
    fileId: "file-1",
    blobId: "blob-1",
    sizeBytes: 42,
    includeBlobId: true,
    includeWalrusDebug: true,
    meta: {
      walrusEndEpoch: "9",
      walrusSource: "already_certified",
      walrusObjectId: "object-1",
    },
  });

  assert.deepEqual(response, {
    fileId: "file-1",
    blobId: "blob-1",
    sizeBytes: 42,
    status: "ready",
    walrusEndEpoch: 9,
    walrusDebug: {
      source: "already_certified",
      objectId: "object-1",
    },
  });
});

test("buildUploadCancelResponse shapes terminal cancel responses", () => {
  assert.deepEqual(buildUploadCancelResponse({ uploadId: "upload-1", status: "canceled" }), {
    ok: true,
    uploadId: "upload-1",
    status: "canceled",
  });

  assert.deepEqual(buildUploadCancelResponse({ uploadId: "upload-1", status: "expired" }), {
    ok: true,
    uploadId: "upload-1",
    status: "expired",
  });

  assert.deepEqual(buildUploadCancelResponse({ uploadId: "upload-1", status: "failed" }), {
    ok: true,
    uploadId: "upload-1",
    status: "failed",
  });
});
