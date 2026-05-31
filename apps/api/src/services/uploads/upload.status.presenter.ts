import { buildFinalizeDiagnostics } from "./finalize.shared.js";

export type UploadStatusResponseMeta = Record<string, string> | null | undefined;

export type UploadStatusResponse = {
  uploadId: string;
  chunkSize: number | null;
  totalChunks: number | null;
  receivedChunks: number[];
  receivedChunkCount: number;
  expiresAt: number | null;
  status: string;
  pollAfterMs?: number;
  fileId?: string;
  blobId?: string;
  walrusEndEpoch?: number;
  walrusDebug?: {
    source?: string;
    objectId?: string;
  };
  error?: string;
} & Record<string, unknown>;

export function buildUploadStatusResponse(params: {
  uploadId: string;
  chunkSize: number | null;
  totalChunks: number | null;
  receivedChunks: number[];
  expiresAt: number | null;
  status: string;
  meta?: UploadStatusResponseMeta;
  includeBlobId: boolean;
  includeWalrusDebug: boolean;
  pollAfterMs?: number;
}): UploadStatusResponse {
  return {
    uploadId: params.uploadId,
    chunkSize: params.chunkSize,
    totalChunks: params.totalChunks,
    receivedChunks: params.receivedChunks,
    receivedChunkCount: params.receivedChunks.length,
    expiresAt: params.expiresAt,
    status: params.status,
    ...(params.pollAfterMs !== undefined ? { pollAfterMs: params.pollAfterMs } : {}),
    ...(params.meta?.fileId ? { fileId: params.meta.fileId } : {}),
    ...(params.includeBlobId && params.meta?.blobId ? { blobId: params.meta.blobId } : {}),
    ...(params.meta?.walrusEndEpoch ? { walrusEndEpoch: Number(params.meta.walrusEndEpoch) } : {}),
    ...(params.includeWalrusDebug && (params.meta?.walrusSource || params.meta?.walrusObjectId)
      ? {
          walrusDebug: {
            ...(params.meta?.walrusSource ? { source: params.meta.walrusSource } : {}),
            ...(params.meta?.walrusObjectId ? { objectId: params.meta.walrusObjectId } : {}),
          },
        }
      : {}),
    ...(params.meta?.error ? { error: params.meta.error } : {}),
    ...buildFinalizeDiagnostics(params.meta ?? undefined),
  };
}
