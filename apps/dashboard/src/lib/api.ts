import type {
  FeedResponse,
  FileRecord,
  ProvenanceRecord,
  RenewFileResponse,
  UploadCreateResponse,
  UploadStatusResponse,
} from "@/types";

const DEFAULT_API_BASE = (import.meta.env.VITE_FLOE_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const custom = localStorage.getItem("floe:config:api_base");
    if (custom) return custom.replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE;
}

export function setApiBase(url: string | null) {
  if (typeof window !== "undefined") {
    if (url) {
      localStorage.setItem("floe:config:api_base", url);
    } else {
      localStorage.removeItem("floe:config:api_base");
    }
  }
}

function apiUrl(pathname: string, params?: Record<string, string | number | null | undefined>): string {
  const url = new URL(pathname.replace(/^\/+/, ""), `${getApiBase()}/`);
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
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const errBody = body as { error?: { message?: string } | string; message?: string } | null;
    const message =
      (typeof errBody?.error === "object" ? errBody.error?.message : errBody?.error) ??
      errBody?.message ??
      response.statusText ??
      "Request failed";
    throw new Error(String(message));
  }

  return body as T;
}

export async function listFiles(filters: {
  owner?: string;
  chain?: string;
  limit?: number;
  cursor?: string | null;
}): Promise<FeedResponse> {
  const response = await fetch(apiUrl("/v1/search", filters));
  return readJson<FeedResponse>(response);
}

export async function getProvenance(fileId: string): Promise<ProvenanceRecord> {
  const response = await fetch(apiUrl(`/v1/files/${encodeURIComponent(fileId)}/provenance`));
  return readJson<ProvenanceRecord>(response);
}

export async function createUpload(
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<UploadCreateResponse> {
  const response = await fetch(apiUrl("/v1/uploads/create"), {
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
  formData.append(
    "file",
    new File([params.chunk], params.fileName, {
      type: params.contentType || "application/octet-stream",
    })
  );

  const response = await fetch(
    apiUrl(`/v1/uploads/${encodeURIComponent(params.uploadId)}/chunk/${params.index}`),
    {
      method: "PUT",
      headers: {
        ...params.headers,
        "x-chunk-sha256": params.chunkSha256,
      },
      body: formData,
    }
  );

  return readJson(response);
}

export async function completeUpload(
  uploadId: string,
  headers: Record<string, string>
): Promise<UploadStatusResponse> {
  const response = await fetch(apiUrl(`/v1/uploads/${encodeURIComponent(uploadId)}/complete`), {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  return readJson<UploadStatusResponse>(response);
}

export async function getUploadStatus(
  uploadId: string,
  headers: Record<string, string> = {}
): Promise<UploadStatusResponse> {
  const response = await fetch(apiUrl(`/v1/uploads/${encodeURIComponent(uploadId)}/status`), {
    headers,
  });
  return readJson<UploadStatusResponse>(response);
}

export async function renewFile(params: {
  fileId: string;
  epochs: number;
  blobObjectId?: string | null;
  headers?: Record<string, string>;
}): Promise<RenewFileResponse> {
  const response = await fetch(apiUrl(`/v1/files/${encodeURIComponent(params.fileId)}/renew`), {
    method: "POST",
    headers: {
      ...(params.headers ?? {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      epochs: params.epochs,
      ...(params.blobObjectId ? { blobObjectId: params.blobObjectId } : {}),
    }),
  });

  return readJson<RenewFileResponse>(response);
}

export function buildMetadataUrl(fileId: string) {
  return `${getApiBase()}/v1/files/${encodeURIComponent(fileId)}/metadata.json`;
}

export function buildStreamUrl(fileId: string) {
  return `${getApiBase()}/v1/files/${encodeURIComponent(fileId)}/stream`;
}

export function buildProvenanceUrl(fileId: string) {
  return `${getApiBase()}/v1/files/${encodeURIComponent(fileId)}/provenance`;
}

export function normalizeFileRecord(file: FileRecord): FileRecord {
  return {
    ...file,
    ownerAddress: file.ownerAddress ?? file.owner ?? null,
  };
}
