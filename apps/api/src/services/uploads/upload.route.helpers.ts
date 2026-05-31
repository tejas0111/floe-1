export { shouldExposeBlobId, shouldExposeWalrusDebug } from "../http/route.helpers.js";
export {
  authzErrorCode as uploadAuthzErrorCode,
  authzStatusCode as uploadAuthzStatusCode,
} from "../http/route.helpers.js";

export function getUploadIdempotencyKey(req: { headers: Record<string, unknown> }): string | null {
  const raw = req.headers["idempotency-key"];
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (Buffer.byteLength(value, "utf8") > 256) return null;
  return value;
}

export async function loadUploadStateSnapshot<TSession extends { expiresAt: number } | null>(params: {
  redis: {
    hgetall<T>(key: string): Promise<T>;
  };
  metaKey: string;
  uploadId: string;
  getSession: (uploadId: string) => Promise<TSession>;
  expireUploadIfNeeded: (params: {
    uploadId: string;
    session?: { expiresAt: number } | null;
    meta?: Record<string, string> | null;
  }) => Promise<boolean>;
}): Promise<{
  session: TSession;
  meta: Record<string, string> | null;
  currentMeta: Record<string, string> | null;
  expired: boolean;
}> {
  const [session, meta] = await Promise.all([
    params.getSession(params.uploadId),
    params.redis.hgetall<Record<string, string>>(params.metaKey),
  ] as const);
  const expired = await params.expireUploadIfNeeded({ uploadId: params.uploadId, session, meta });
  const currentMeta = expired
    ? await params.redis.hgetall<Record<string, string>>(params.metaKey)
    : meta;
  return {
    session,
    meta,
    currentMeta,
    expired,
  };
}
