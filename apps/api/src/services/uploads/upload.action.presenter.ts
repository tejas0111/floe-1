import { buildFinalizeDiagnostics } from "./finalize.shared.js";

export type UploadActionMeta = Record<string, string> | null | undefined;

export function buildUploadCompleteFinalizingResponse(params: {
  uploadId: string;
  pollAfterMs: number;
  enqueued: boolean;
  inProgress?: boolean;
  meta?: UploadActionMeta;
}) {
  return {
    uploadId: params.uploadId,
    status: "finalizing" as const,
    pollAfterMs: params.pollAfterMs,
    enqueued: params.enqueued,
    ...(params.inProgress ? { inProgress: true } : {}),
    ...buildFinalizeDiagnostics(params.meta ?? undefined),
  };
}

export function buildUploadCompleteReadyResponse(params: {
  fileId: string;
  blobId?: string;
  sizeBytes: number;
  includeBlobId: boolean;
  includeWalrusDebug: boolean;
  meta?: UploadActionMeta;
}) {
  return {
    fileId: params.fileId,
    ...(params.includeBlobId && params.blobId ? { blobId: params.blobId } : {}),
    sizeBytes: params.sizeBytes,
    status: "ready" as const,
    ...(params.meta?.walrusEndEpoch ? { walrusEndEpoch: Number(params.meta.walrusEndEpoch) } : {}),
    ...(params.includeWalrusDebug && (params.meta?.walrusSource || params.meta?.walrusObjectId)
      ? {
          walrusDebug: {
            ...(params.meta?.walrusSource ? { source: params.meta.walrusSource } : {}),
            ...(params.meta?.walrusObjectId ? { objectId: params.meta.walrusObjectId } : {}),
          },
        }
      : {}),
  };
}

export function buildUploadCancelResponse(params: {
  uploadId: string;
  status: "canceled" | "expired" | "failed";
}) {
  return {
    ok: true as const,
    uploadId: params.uploadId,
    status: params.status,
  };
}
