export type FileRecord = {
  fileId: string;
  blobId: string;
  blobObjectId: string | null;
  filename: string | null;
  checksum: string | null;
  ownerAddress: string | null;
  sizeBytes: number;
  mimeType: string;
  walrusEndEpoch: number | null;
  targetChain: string | null;
  anchorTxId: string | null;
  createdAtMs: number;
  source?: string;
  rpcProvider?: string;
};

export type FileListResponse = {
  source?: string;
  data: FileRecord[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

export type ProvenanceRecord = {
  fileId: string;
  filename: string | null;
  blobId: string | null;
  blobObjectId: string | null;
  ownerAddress: string | null;
  targetChain: string | null;
  anchorTxId: string | null;
  explorerUrl: string | null;
  metadataUrl: string;
  streamUrl: string;
  sizeBytes: number | null;
  mimeType: string | null;
  walrusEndEpoch: number | null;
  createdAtMs: number | null;
};

export type UploadCreateResponse = {
  uploadId: string;
  totalChunks?: number;
  chunkSize?: number;
};

export type UploadStatusResponse = {
  uploadId: string;
  status: string;
  fileId?: string;
  blobId?: string;
  pollAfterMs?: number;
  error?: string;
  [key: string]: unknown;
};

function apiUrl(pathname: string, params?: Record<string, string | number | null | undefined>): string {
  const url = new URL(pathname, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || body?.error || response.statusText || "Request failed";
    const error = new Error(String(message));
    (error as Error & { body?: unknown; status?: number }).body = body;
    (error as Error & { body?: unknown; status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

export async function listFiles(filters: { owner?: string; chain?: string }): Promise<FileListResponse> {
  const response = await fetch(apiUrl("/api/files", filters));
  return readJson<FileListResponse>(response);
}

export async function getProvenance(fileId: string): Promise<ProvenanceRecord> {
  const response = await fetch(apiUrl(`/api/files/${encodeURIComponent(fileId)}/provenance`));
  return readJson<ProvenanceRecord>(response);
}

export async function createUpload(body: Record<string, unknown>, headers: Record<string, string>): Promise<UploadCreateResponse> {
  const response = await fetch(apiUrl("/api/uploads/create"), {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readJson<UploadCreateResponse>(response);
}

export async function uploadChunk(params: {
  uploadId: string;
  index: number;
  chunk: Blob;
  fileName: string;
  contentType: string;
  headers: Record<string, string>;
  chunkSha256: string;
}): Promise<unknown> {
  const formData = new FormData();
  formData.append("file", new File([params.chunk], params.fileName, { type: params.contentType || "application/octet-stream" }));

  const response = await fetch(apiUrl(`/api/uploads/${encodeURIComponent(params.uploadId)}/chunk/${params.index}`), {
    method: "PUT",
    headers: {
      ...params.headers,
      "x-chunk-sha256": params.chunkSha256,
    },
    body: formData,
  });
  return readJson(response);
}

export async function completeUpload(uploadId: string, headers: Record<string, string>): Promise<UploadStatusResponse> {
  const response = await fetch(apiUrl(`/api/uploads/${encodeURIComponent(uploadId)}/complete`), {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  return readJson<UploadStatusResponse>(response);
}

export async function getUploadStatus(uploadId: string, headers: Record<string, string> = {}): Promise<UploadStatusResponse> {
  const response = await fetch(apiUrl(`/api/uploads/${encodeURIComponent(uploadId)}/status`), {
    headers,
  });
  return readJson<UploadStatusResponse>(response);
}

export function apiPath(pathname: string): string {
  return apiUrl(pathname);
}
