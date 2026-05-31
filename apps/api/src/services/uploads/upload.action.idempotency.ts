import crypto from "crypto";

import { sendApiError } from "../../utils/apiError.js";
import type { RedisClient } from "../../state/redis.types.js";

export type UploadActionIdempotencyRecord = {
  fingerprint: string;
  statusCode: number;
  responseBody: Record<string, unknown>;
  retryAfter?: string;
};

export function buildUploadActionFingerprint(input: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function shapeUploadActionIdempotencyRecord(params: {
  fingerprint: string;
  statusCode: number;
  responseBody: Record<string, unknown>;
  retryAfter?: string;
}): Record<string, string> {
  return {
    fingerprint: params.fingerprint,
    statusCode: String(params.statusCode),
    responseBody: JSON.stringify(params.responseBody),
    ...(params.retryAfter ? { retryAfter: params.retryAfter } : {}),
  };
}

export function parseUploadActionIdempotencyRecord(
  data: Record<string, string> | null | undefined
): UploadActionIdempotencyRecord | null {
  if (!data || Object.keys(data).length === 0) return null;
  const statusCode = Number(data.statusCode);
  if (
    typeof data.fingerprint !== "string" ||
    !Number.isInteger(statusCode) ||
    statusCode < 200 ||
    statusCode > 299 ||
    typeof data.responseBody !== "string"
  ) {
    throw new Error("CORRUPT_UPLOAD_ACTION_IDEMPOTENCY_RECORD");
  }

  let responseBody: Record<string, unknown>;
  try {
    responseBody = JSON.parse(data.responseBody) as Record<string, unknown>;
  } catch {
    throw new Error("CORRUPT_UPLOAD_ACTION_IDEMPOTENCY_RECORD");
  }

  return {
    fingerprint: data.fingerprint,
    statusCode,
    responseBody,
    retryAfter:
      typeof data.retryAfter === "string" && data.retryAfter.length > 0
        ? data.retryAfter
        : undefined,
  };
}

export async function readUploadActionIdempotencyRecord(
  redis: RedisClient,
  key: string
): Promise<UploadActionIdempotencyRecord | null> {
  const data = await redis.hgetall<Record<string, string>>(key);
  return parseUploadActionIdempotencyRecord(data);
}

export async function sendUploadActionIdempotencyReplay(params: {
  reply: any;
  redis: RedisClient;
  key: string;
  fingerprint: string;
  conflictMessage: string;
}): Promise<"replayed" | "conflict" | "missing"> {
  const record = await readUploadActionIdempotencyRecord(params.redis, params.key);
  if (!record) return "missing";
  if (record.fingerprint !== params.fingerprint) {
    sendApiError(
      params.reply,
      409,
      "IDEMPOTENCY_KEY_REUSED",
      params.conflictMessage
    );
    return "conflict";
  }
  if (record.retryAfter) {
    params.reply.header("Retry-After", record.retryAfter);
  }
  params.reply.header("Idempotency-Replayed", "true");
  params.reply.code(record.statusCode).send(record.responseBody);
  return "replayed";
}

export async function persistUploadActionIdempotencyRecord(params: {
  redis: RedisClient;
  key: string | null;
  fingerprint: string | null;
  ttlMs?: number | null;
  statusCode: number;
  responseBody: Record<string, unknown>;
  retryAfter?: string;
  log: { warn: (...args: any[]) => void };
  uploadId: string;
}) {
  if (!params.key || !params.fingerprint) return;
  const sessionTtlMs =
    params.ttlMs ??
    (await import("../../config/uploads.config.js")).UploadConfig.sessionTtlMs;
  const ttlSeconds = Math.max(1, Math.ceil(Math.max(0, sessionTtlMs) / 1000));
  await params.redis
    .multi()
    .hset(
      params.key,
      shapeUploadActionIdempotencyRecord({
        fingerprint: params.fingerprint,
        statusCode: params.statusCode,
        responseBody: params.responseBody,
        retryAfter: params.retryAfter,
      })
    )
    .expire(params.key, ttlSeconds)
    .exec()
    .catch((err) => {
      params.log.warn({ err, uploadId: params.uploadId }, "Failed to persist upload action idempotency record");
    });
}
