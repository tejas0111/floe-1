import test from "node:test";
import assert from "node:assert/strict";

import { buildUploadStatusResponse } from "../src/services/uploads/upload.status.presenter.ts";

test("buildUploadStatusResponse shapes the session-backed status payload", () => {
  const response = buildUploadStatusResponse({
    uploadId: "11111111-1111-1111-1111-111111111111",
    chunkSize: 4,
    totalChunks: 3,
    receivedChunks: [0, 2],
    expiresAt: 1710000000000,
    status: "finalizing",
    pollAfterMs: 2000,
    meta: {
      fileId: "file-1",
      blobId: "blob-1",
      walrusEndEpoch: "12",
      walrusSource: "already_certified",
      walrusObjectId: "object-1",
      error: "transient failure",
      finalizeStage: "walrus_publish",
      finalizeAttemptState: "running",
      finalizeWalrusMs: "11",
    },
    includeBlobId: true,
    includeWalrusDebug: true,
  });

  assert.deepEqual(response, {
    uploadId: "11111111-1111-1111-1111-111111111111",
    chunkSize: 4,
    totalChunks: 3,
    receivedChunks: [0, 2],
    receivedChunkCount: 2,
    expiresAt: 1710000000000,
    status: "finalizing",
    pollAfterMs: 2000,
    fileId: "file-1",
    blobId: "blob-1",
    walrusEndEpoch: 12,
    walrusDebug: {
      source: "already_certified",
      objectId: "object-1",
    },
    error: "transient failure",
    finalizeStage: "walrus_publish",
    finalizeAttemptState: "running",
    finalizeWalrusMs: 11,
  });
});

test("buildUploadStatusResponse shapes the meta-backed status payload without session data", () => {
  const response = buildUploadStatusResponse({
    uploadId: "22222222-2222-2222-2222-222222222222",
    chunkSize: null,
    totalChunks: null,
    receivedChunks: [],
    expiresAt: null,
    status: "failed",
    meta: {
      status: "failed",
      fileId: "file-2",
      walrusEndEpoch: "9",
      error: "irrecoverable",
    },
    includeBlobId: false,
    includeWalrusDebug: false,
  });

  assert.deepEqual(response, {
    uploadId: "22222222-2222-2222-2222-222222222222",
    chunkSize: null,
    totalChunks: null,
    receivedChunks: [],
    receivedChunkCount: 0,
    expiresAt: null,
    status: "failed",
    fileId: "file-2",
    walrusEndEpoch: 9,
    error: "irrecoverable",
  });
});
