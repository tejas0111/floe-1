function parseBooleanQueryValue(raw: unknown): boolean {
  return raw === "1" || raw === "true" || raw === true;
}

export function authzStatusCode(code?: string): 401 | 403 {
  return code === "AUTH_REQUIRED" ? 401 : 403;
}

export function authzErrorCode(code?: string): "AUTH_REQUIRED" | "OWNER_MISMATCH" | "INSUFFICIENT_SCOPE" {
  if (code === "AUTH_REQUIRED") return "AUTH_REQUIRED";
  if (code === "INSUFFICIENT_SCOPE") return "INSUFFICIENT_SCOPE";
  return "OWNER_MISMATCH";
}

export function shouldExposeBlobId(query: any): boolean {
  if (process.env.FLOE_EXPOSE_BLOB_ID === "1") return true;
  return parseBooleanQueryValue(
    query?.includeBlobId ?? query?.include_blob_id ?? query?.includeStorage
  );
}

export function shouldExposeWalrusDebug(query: any): boolean {
  return parseBooleanQueryValue(query?.debug ?? query?.includeDebug ?? query?.includeWalrusDebug);
}
