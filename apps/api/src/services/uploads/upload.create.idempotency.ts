import crypto from "crypto";

import { sendApiError } from "../../utils/apiError.js";
import type { RedisClient } from "../../state/redis.types.js";

export type CreateUploadIdempotencyRecord = {
  fingerprint: string;
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  epochs: number;
  expiresAt: number;
};

export function buildCreateUploadFingerprint(input: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function shapeCreateIdempotencyRecord(params: {
  fingerprint: string;
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  epochs: number;
  expiresAt: number;
}): Record<string, string> {
  return {
    fingerprint: params.fingerprint,
    uploadId: params.uploadId,
    chunkSize: String(params.chunkSize),
    totalChunks: String(params.totalChunks),
    epochs: String(params.epochs),
    expiresAt: String(params.expiresAt),
  };
}

export function parseCreateIdempotencyRecord(
  data: Record<string, string> | null | undefined
): CreateUploadIdempotencyRecord | null {
  if (!data || Object.keys(data).length === 0) return null;

  const chunkSize = Number(data.chunkSize);
  const totalChunks = Number(data.totalChunks);
  const epochs = Number(data.epochs);
  const expiresAt = Number(data.expiresAt);
  if (
    typeof data.fingerprint !== "string" ||
    typeof data.uploadId !== "string" ||
    !Number.isFinite(chunkSize) ||
    !Number.isFinite(totalChunks) ||
    !Number.isFinite(epochs) ||
    !Number.isFinite(expiresAt)
  ) {
    throw new Error("CORRUPT_CREATE_IDEMPOTENCY_RECORD");
  }

  return {
    fingerprint: data.fingerprint,
    uploadId: data.uploadId,
    chunkSize,
    totalChunks,
    epochs,
    expiresAt,
  };
}

export async function readCreateIdempotencyRecord(
  redis: RedisClient,
  key: string
): Promise<CreateUploadIdempotencyRecord | null> {
  const data = await redis.hgetall<Record<string, string>>(key);
  return parseCreateIdempotencyRecord(data);
}

export async function sendCreateIdempotencyReplay(params: {
  reply: any;
  redis: RedisClient;
  key: string;
  fingerprint: string;
}): Promise<"replayed" | "conflict" | "missing"> {
  const record = await readCreateIdempotencyRecord(params.redis, params.key);
  if (!record) return "missing";
  if (record.fingerprint !== params.fingerprint) {
    sendApiError(
      params.reply,
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency key was already used with a different create payload"
    );
    return "conflict";
  }

  params.reply.header("Idempotency-Replayed", "true");
  params.reply.code(201).send({
    uploadId: record.uploadId,
    chunkSize: record.chunkSize,
    totalChunks: record.totalChunks,
    epochs: record.epochs,
    expiresAt: record.expiresAt,
  });
  return "replayed";
}

export async function persistCreateIdempotencyRecord(params: {
  redis: RedisClient;
  key: string | null;
  fingerprint: string | null;
  ttlMs: number;
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  epochs: number;
  expiresAt: number;
  log: { warn: (...args: any[]) => void };
}) {
  if (!params.key || !params.fingerprint) return;
  const ttlSeconds = Math.max(1, Math.ceil(Math.max(0, params.ttlMs) / 1000));
  await params.redis
    .multi()
    .hset(
      params.key,
      shapeCreateIdempotencyRecord({
        fingerprint: params.fingerprint,
        uploadId: params.uploadId,
        chunkSize: params.chunkSize,
        totalChunks: params.totalChunks,
        epochs: params.epochs,
        expiresAt: params.expiresAt,
      })
    )
    .expire(params.key, ttlSeconds)
    .exec()
    .catch((err) => {
      params.log.warn({ err, uploadId: params.uploadId }, "Failed to persist create idempotency record");
    });
}
