import { FastifyInstance } from "fastify";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import { sendApiError } from "../utils/apiError.js";
import { ChunkConfig, UploadConfig } from "../config/uploads.config.js";
import { WalrusEpochLimits } from "../config/walrus.config.js";
import { AuthUploadPolicyConfig } from "../config/auth.config.js";

import {
  createSession,
  getSession,
  touchUploadActivity,
} from "../services/uploads/upload-state.js";
import {
  enqueueUploadFinalize,
  isUploadFinalizeQueued,
} from "../services/uploads/finalize.queue.js";
import {
  buildUploadCancelResponse,
  buildUploadCompleteFinalizingResponse,
  buildUploadCompleteReadyResponse,
} from "../services/uploads/upload.action.presenter.js";
import {
  buildUploadActionFingerprint,
  persistUploadActionIdempotencyRecord,
  sendUploadActionIdempotencyReplay,
} from "../services/uploads/upload.action.idempotency.js";
import {
  buildCreateUploadFingerprint,
  persistCreateIdempotencyRecord,
  sendCreateIdempotencyReplay,
} from "../services/uploads/upload.create.idempotency.js";
import { buildUploadStatusResponse } from "../services/uploads/upload.status.presenter.js";
import {
  getUploadIdempotencyKey,
  loadUploadStateSnapshot,
  shouldExposeBlobId,
  shouldExposeWalrusDebug,
  uploadAuthzErrorCode,
  uploadAuthzStatusCode,
} from "../services/uploads/upload.route.helpers.js";
import { applyRateLimitHeaders } from "../services/auth/auth.headers.js";
import {
  emitInfrastructureEvent,
  requestEventContext,
} from "../services/events/infrastructure.events.js";

import { chunkStore } from "../store/index.js";
import type { RedisClient } from "../state/redis.types.js";
import { getRedis } from "../state/redis.js";
import { uploadKeys } from "../state/keys.js";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function finalBinPath(uploadId: string) {
  return path.join(UploadConfig.tmpDir, `${uploadId}.bin`);
}

const SUI_ADDRESS_RE = /^(0x)?[0-9a-fA-F]{64}$/;
function parseOptionalSuiAddressEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  if (!SUI_ADDRESS_RE.test(raw)) {
    throw new Error(`${name} must be a valid 32-byte Sui address`);
  }
  return `0x${raw.replace(/^0x/i, "").toLowerCase()}`;
}

function parsePositiveIntEnv(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }
  return n;
}

const DEFAULT_OWNER_ADDRESS = parseOptionalSuiAddressEnv("FLOE_DEFAULT_OWNER_ADDRESS");

const FINALIZE_POLL_AFTER_MS = parsePositiveIntEnv("FLOE_FINALIZE_STATUS_POLL_MS", 2000);
const RETRYABLE_RETRY_AFTER_SECONDS = 5;
const REDIS_DEPENDENCY_UNAVAILABLE = Symbol("REDIS_DEPENDENCY_UNAVAILABLE");
const IDEMPOTENCY_LOCK_TTL_SECONDS = 30;

function finalizePollRetryAfterSeconds(): string {
  return String(Math.max(1, Math.ceil(FINALIZE_POLL_AFTER_MS / 1000)));
}

function readExpiresAt(meta?: Record<string, string> | null, session?: { expiresAt: number } | null): number | null {
  if (session?.expiresAt && Number.isFinite(session.expiresAt)) {
    return session.expiresAt;
  }
  const value = Number(meta?.expiresAt ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function expireUploadIfNeeded(params: {
  uploadId: string;
  session?: { expiresAt: number } | null;
  meta?: Record<string, string> | null;
}): Promise<boolean> {
  const terminalStatus = params.meta?.status;
  if (
    terminalStatus === "completed" ||
    terminalStatus === "failed" ||
    terminalStatus === "canceled" ||
    terminalStatus === "expired"
  ) {
    return terminalStatus === "expired";
  }

  const expiresAt = readExpiresAt(params.meta, params.session);
  if (!expiresAt || expiresAt > Date.now()) {
    return false;
  }

  const redis = getRedis();
  await redis.multi()
    .hset(uploadKeys.meta(params.uploadId), {
      status: "expired",
      expiredAt: String(Date.now()),
    })
    .del(uploadKeys.session(params.uploadId))
    .sadd(uploadKeys.gcIndex(), params.uploadId)
    .srem(uploadKeys.activeIndex(), params.uploadId)
    .exec();
  return true;
}

async function tryReserveUploadCapacity(params: {
  maxActiveUploads: number;
  uploadId: string;
}): Promise<boolean> {
  const redis = getRedis();
  const script = `
    local key = KEYS[1]
    local nowMs = tonumber(ARGV[3])
    local activeIds = redis.call("SMEMBERS", key)
    for _, activeUploadId in ipairs(activeIds) do
      local metaKey = "floe:v1:upload:" .. activeUploadId .. ":meta"
      local sessionKey = "floe:v1:upload:" .. activeUploadId .. ":session"
      local status = redis.call("HGET", metaKey, "status")
      local expiresAt = tonumber(redis.call("HGET", metaKey, "expiresAt") or "0")
      local hasSession = tonumber(redis.call("EXISTS", sessionKey))
      if status == "completed" or status == "failed" or status == "canceled" or status == "expired" then
        redis.call("SREM", key, activeUploadId)
      elseif expiresAt > 0 and expiresAt <= nowMs then
        redis.call("SREM", key, activeUploadId)
      elseif hasSession == 0 then
        redis.call("SREM", key, activeUploadId)
      end
    end
    local max = tonumber(ARGV[1])
    local uploadId = ARGV[2]
    local count = tonumber(redis.call("SCARD", key))
    if count >= max then
      return 0
    end
    redis.call("SADD", key, uploadId)
    return 1
  `;

  const reserved = await redis.eval(
    script,
    [uploadKeys.activeIndex()],
    [String(params.maxActiveUploads), params.uploadId, String(Date.now())]
  );

  return Number(reserved) === 1;
}

async function reconcileReceivedChunks(uploadId: string): Promise<number[]> {
  const redis = getRedis();
  const redisMembers = await redis.smembers<string[]>(uploadKeys.chunks(uploadId));
  const redisChunks = Array.isArray(redisMembers)
    ? redisMembers.map(Number).filter(Number.isInteger)
    : [];

  let storeChunks: number[] = [];
  try {
    storeChunks = await chunkStore.listChunks(uploadId);
  } catch (err) {
    throw Object.assign(new Error("CHUNK_STORE_UNAVAILABLE"), {
      cause: err,
    });
  }

  const merged = [...new Set([...redisChunks, ...storeChunks])].sort((a, b) => a - b);
  const missingInRedis = merged.filter((idx) => !redisChunks.includes(idx));
  if (missingInRedis.length > 0) {
    await Promise.all(
      missingInRedis.map((idx) => redis.sadd(uploadKeys.chunks(uploadId), String(idx)))
    );
  }

  return merged;
}

async function requireRedis(reply: any): Promise<RedisClient | null> {
  try {
    return getRedis();
  } catch (err) {
    if (isRedisDependencyError(err)) {
      sendRedisUnavailable(reply);
      return null;
    }
    throw err;
  }
}

function isRedisDependencyError(err: unknown): boolean {
  const message = String((err as Error)?.message ?? "").toLowerCase();
  return (
    message.includes("redis") ||
    message.includes("not initialized") ||
    message.includes("econn") ||
    message.includes("socket") ||
    message.includes("connection")
  );
}

function sendRedisUnavailable(reply: any) {
  reply.header("Retry-After", String(RETRYABLE_RETRY_AFTER_SECONDS));
  return sendApiError(
    reply,
    503,
    "DEPENDENCY_UNAVAILABLE",
    "Redis is unavailable, retry shortly",
    {
      retryable: true,
      details: {
        dependency: "redis",
      },
    }
  );
}

async function guardRedisDependency<T>(
  reply: any,
  op: () => Promise<T>
): Promise<T | typeof REDIS_DEPENDENCY_UNAVAILABLE> {
  try {
    return await op();
  } catch (err) {
    if (isRedisDependencyError(err)) {
      sendRedisUnavailable(reply);
      return REDIS_DEPENDENCY_UNAVAILABLE;
    }
    throw err;
  }
}

export default async function uploadRoutes(app: FastifyInstance) {
  app.post("/v1/uploads/create", async (req, reply) => {
    const log = req.log;
    const body = req.body as any;
    const createLimit = await req.server.authProvider.checkRateLimit({
      req,
      scope: "upload_control",
    });
    applyRateLimitHeaders(reply, createLimit);
    if (!createLimit.allowed) {
      return sendApiError(reply, 429, "RATE_LIMITED", "Rate limit exceeded", {
        retryable: true,
        details: {
          limit: createLimit.limit,
          current: createLimit.current,
          windowSeconds: createLimit.windowSeconds,
          authenticated: createLimit.identity.authenticated,
          authMethod: createLimit.identity.method,
        },
      });
    }

    const authzCreate = await req.server.authProvider.authorizeUploadAccess({
      req,
      action: "create",
    });
    if (!authzCreate.allowed) {
      return sendApiError(
        reply,
        uploadAuthzStatusCode(authzCreate.code),
        uploadAuthzErrorCode(authzCreate.code),
        authzCreate.message ?? "Upload access denied"
      );
    }

    if (!body || typeof body !== "object") {
      return sendApiError(
        reply,
        400,
        "INVALID_REQUEST_BODY",
        "Request body must be JSON"
      );
    }

    const { filename, contentType, sizeBytes, chunkSize, epochs, checksum, targetChain, owner: bodyOwner } = body;
    log.info({ filename, targetChain, bodyOwner }, "Received create upload request");

    if (!filename || !contentType || !sizeBytes) {
      return sendApiError(
        reply,
        400,
        "INVALID_CREATE_UPLOAD_REQUEST",
        "Missing required fields"
      );
    }

    const headerOwner = (req.headers["x-owner-address"] as string | undefined)?.trim() || undefined;
    const requestOwner = (bodyOwner as string)?.trim() || headerOwner || createLimit.identity.owner;

    if (typeof filename !== "string" || filename.length > 512) {
      return sendApiError(
        reply,
        400,
        "INVALID_FILENAME",
        "filename must be <= 512 chars"
      );
    }

    if (typeof contentType !== "string" || contentType.length > 128) {
      return sendApiError(
        reply,
        400,
        "INVALID_CONTENT_TYPE",
        "contentType must be <= 128 chars"
      );
    }

    let checksumValue: string | undefined;
    if (checksum !== undefined) {
      if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/i.test(checksum)) {
        return sendApiError(reply, 400, "INVALID_CHECKSUM", "checksum must be a 64-char hex sha256");
      }
      checksumValue = checksum.toLowerCase();
    }

    const fileSizeNum = Number(sizeBytes);
    if (!Number.isFinite(fileSizeNum) || fileSizeNum <= 0) {
      return sendApiError(reply, 400, "INVALID_FILE_SIZE", "sizeBytes must be positive");
    }

    const tierMaxFileSizeBytes = createLimit.identity.authenticated
      ? AuthUploadPolicyConfig.maxFileSizeBytes.authenticated
      : AuthUploadPolicyConfig.maxFileSizeBytes.public;
    const effectiveMaxFileSizeBytes = Math.min(
      UploadConfig.maxFileSizeBytes,
      tierMaxFileSizeBytes
    );

    if (fileSizeNum > effectiveMaxFileSizeBytes) {
      return sendApiError(
        reply,
        413,
        "FILE_TOO_LARGE",
        `File exceeds maxFileSizeBytes (${effectiveMaxFileSizeBytes})`
      );
    }

    let chunkSizeNum: number | undefined;
    if (chunkSize !== undefined) {
      chunkSizeNum = Number(chunkSize);
      if (!Number.isFinite(chunkSizeNum) || chunkSizeNum <= 0) {
        return sendApiError(
          reply,
          400,
          "INVALID_CHUNK_SIZE",
          "chunkSize must be a positive number"
        );
      }
    }

    let epochsNum: number | undefined;
    if (epochs !== undefined) {
      epochsNum = Number(epochs);
      if (!Number.isFinite(epochsNum) || epochsNum <= 0) {
        return sendApiError(reply, 400, "INVALID_EPOCHS", "epochs must be a positive number");
      }
    }

    const resolvedChunkSize = Math.min(
      ChunkConfig.maxBytes,
      Math.max(ChunkConfig.minBytes, chunkSizeNum ?? ChunkConfig.defaultBytes)
    );

    const resolvedEpochs = Math.min(
      WalrusEpochLimits.max,
      Math.max(WalrusEpochLimits.min, epochsNum ?? WalrusEpochLimits.default)
    );

    const totalChunks = Math.ceil(fileSizeNum / resolvedChunkSize);

    if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
      return sendApiError(reply, 400, "INVALID_TOTAL_CHUNKS", "Invalid totalChunks derived from inputs");
    }

    if (totalChunks > UploadConfig.maxTotalChunks) {
      return sendApiError(
        reply,
        413,
        "TOO_MANY_CHUNKS",
        `totalChunks exceeds maxTotalChunks (${UploadConfig.maxTotalChunks})`
      );
    }

    const redis = await requireRedis(reply);
    if (!redis) return;
    const idempotencyKey = getUploadIdempotencyKey(req);
    const idempotencySubject = createLimit.identity.subject;
    const idempotencyRedisKey = idempotencyKey
      ? uploadKeys.createIdempotency(idempotencySubject, idempotencyKey)
      : null;
    const idempotencyFingerprint = idempotencyRedisKey
      ? buildCreateUploadFingerprint({
          subject: idempotencySubject,
          filename,
          contentType,
          sizeBytes: fileSizeNum,
          checksum: checksumValue,
          chunkSize: resolvedChunkSize,
          epochs: resolvedEpochs,
        })
      : null;
    const idempotencyLockKey = idempotencyRedisKey ? `${idempotencyRedisKey}:lock` : null;
    let createIdempotencyLockClaimed = false;

    if (idempotencyRedisKey && idempotencyFingerprint) {
      const replay = await guardRedisDependency(reply, () =>
        sendCreateIdempotencyReplay({
          reply,
          redis,
          key: idempotencyRedisKey,
          fingerprint: idempotencyFingerprint,
        })
      );
      if (replay === REDIS_DEPENDENCY_UNAVAILABLE) return;
      if (replay === "replayed" || replay === "conflict") return;

      const claimed = await guardRedisDependency(reply, () =>
        redis.set(idempotencyLockKey!, idempotencyFingerprint, {
          nx: true,
          ex: IDEMPOTENCY_LOCK_TTL_SECONDS,
        })
      );
      if (claimed === REDIS_DEPENDENCY_UNAVAILABLE) return;
      if (claimed !== "OK") {
        const pendingReplay = await guardRedisDependency(reply, () =>
          sendCreateIdempotencyReplay({
            reply,
            redis,
            key: idempotencyRedisKey,
            fingerprint: idempotencyFingerprint,
          })
        );
        if (pendingReplay === REDIS_DEPENDENCY_UNAVAILABLE) return;
        if (pendingReplay === "replayed" || pendingReplay === "conflict") return;
        return sendApiError(
          reply,
          409,
          "IDEMPOTENCY_REQUEST_IN_PROGRESS",
          "A create request with this idempotency key is already in progress",
          { retryable: true }
        );
      }
      createIdempotencyLockClaimed = true;
    }

    const uploadId = crypto.randomUUID();
    const capacityReserved = await guardRedisDependency(reply, () =>
      tryReserveUploadCapacity({
        maxActiveUploads: UploadConfig.maxActiveUploads,
        uploadId,
      })
    );
    if (capacityReserved === REDIS_DEPENDENCY_UNAVAILABLE) return;

    if (!capacityReserved) {
      if (createIdempotencyLockClaimed && idempotencyLockKey) {
        await redis.del(idempotencyLockKey).catch(() => {});
      }
      return sendApiError(reply, 429, "UPLOAD_CAPACITY_REACHED", "Too many active uploads", {
        retryable: true,
      });
    }

    let sessionCreated = false;
    try {
      const session = await createSession({
        uploadId,
        filename,
        contentType,
        owner: requestOwner ?? DEFAULT_OWNER_ADDRESS,
        checksum: checksumValue,
        sizeBytes: fileSizeNum,
        chunkSize: resolvedChunkSize,
        totalChunks,
        epochs: resolvedEpochs,
        targetChain,
      });
      sessionCreated = true;

      if (idempotencyRedisKey && idempotencyFingerprint) {
        await persistCreateIdempotencyRecord({
          redis,
          key: idempotencyRedisKey,
          fingerprint: idempotencyFingerprint,
          ttlMs: session.expiresAt - Date.now(),
          uploadId: session.uploadId,
          chunkSize: session.chunkSize,
          totalChunks: session.totalChunks,
          epochs: session.resolvedEpochs,
          expiresAt: session.expiresAt,
          log,
        });
      }

      log.info({ uploadId, totalChunks }, "Upload session created");
      const eventContext = requestEventContext(req);
      emitInfrastructureEvent(log, {
        event: "upload_created",
        requestId: eventContext.requestId,
        actor: eventContext.actor,
        uploadId,
        outcome: "success",
        statusCode: 201,
        bytes: fileSizeNum,
        metadata: {
          contentType,
          chunkSize: session.chunkSize,
          totalChunks: session.totalChunks,
          epochs: session.resolvedEpochs,
        },
      });

      return reply.code(201).send({
        uploadId: session.uploadId,
        chunkSize: session.chunkSize,
        totalChunks: session.totalChunks,
        epochs: session.resolvedEpochs,
        expiresAt: session.expiresAt,
      });
    } catch (err) {
      if (isRedisDependencyError(err)) {
        return sendRedisUnavailable(reply);
      }
      log.error({ err }, "Session creation failed");
      return sendApiError(
        reply,
        500,
        "SESSION_CREATE_FAILED",
        "Failed to create upload session",
        {
          retryable: true,
        }
      );
    } finally {
      if (createIdempotencyLockClaimed && idempotencyLockKey) {
        await redis.del(idempotencyLockKey).catch(() => {});
      }
      if (!sessionCreated) {
        await redis
          .multi()
          .del(uploadKeys.session(uploadId))
          .del(uploadKeys.meta(uploadId))
          .del(uploadKeys.chunks(uploadId))
          .srem(uploadKeys.gcIndex(), uploadId)
          .srem(uploadKeys.activeIndex(), uploadId)
          .exec()
          .catch(() => {});
      }
    }
  });

  app.put("/v1/uploads/:uploadId/chunk/:index", async (req, reply) => {
    const log = req.log;
    const { uploadId, index } = req.params as any;
    const chunkLimit = await req.server.authProvider.checkRateLimit({
      req,
      scope: "upload_chunk",
    });
    applyRateLimitHeaders(reply, chunkLimit);
    if (!chunkLimit.allowed) {
      return sendApiError(reply, 429, "RATE_LIMITED", "Rate limit exceeded", {
        retryable: true,
        details: {
          limit: chunkLimit.limit,
          current: chunkLimit.current,
          windowSeconds: chunkLimit.windowSeconds,
          authenticated: chunkLimit.identity.authenticated,
          authMethod: chunkLimit.identity.method,
        },
      });
    }

    if (!isUuid(uploadId)) {
      return sendApiError(reply, 400, "INVALID_UPLOAD_ID", "uploadId must be a UUID");
    }

    const redis = await requireRedis(reply);
    if (!redis) return;

    const loaded = await guardRedisDependency(reply, () =>
      Promise.all([
        getSession(uploadId),
        redis.hgetall<Record<string, string>>(uploadKeys.meta(uploadId)),
      ] as const)
    );
    if (loaded === REDIS_DEPENDENCY_UNAVAILABLE) return;
    const [session, meta] = loaded;
    const expired = await guardRedisDependency(reply, () =>
      expireUploadIfNeeded({ uploadId, session, meta })
    );
    if (expired === REDIS_DEPENDENCY_UNAVAILABLE) return;
    if (expired) {
      return sendApiError(reply, 409, "UPLOAD_EXPIRED", "Upload session expired");
    }
    if (!session) {
      return sendApiError(reply, 404, "UPLOAD_NOT_FOUND", "Invalid uploadId");
    }
    const authzChunk = await req.server.authProvider.authorizeUploadAccess({
      req,
      action: "chunk",
      uploadId,
      uploadOwner: session.owner ?? null,
    });
    if (!authzChunk.allowed) {
      return sendApiError(
        reply,
        uploadAuthzStatusCode(authzChunk.code),
        uploadAuthzErrorCode(authzChunk.code),
        authzChunk.message ?? "Upload access denied"
      );
    }

    if (session.status === "completed") {
      return sendApiError(reply, 409, "UPLOAD_ALREADY_COMPLETED", "Upload is already finalized");
    }

    const idx = Number(index);
    const expectedHash = req.headers["x-chunk-sha256"];

    if (
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx >= session.totalChunks ||
      typeof expectedHash !== "string"
    ) {
      return sendApiError(reply, 400, "INVALID_CHUNK", "Invalid chunk index or hash");
    }

    let part;
    try {
      part = await req.file();
    } catch {
      return sendApiError(reply, 400, "CHUNK_STREAM_ERROR", "Failed to read chunk stream", {
        retryable: true,
      });
    }

    if (!part || part.type !== "file") {
      return sendApiError(reply, 400, "INVALID_CHUNK", "Multipart file field required", {
        retryable: true,
      });
    }

    try {
      const isLastChunk = idx === session.totalChunks - 1;

      const expectedSize = isLastChunk
        ? session.sizeBytes - session.chunkSize * (session.totalChunks - 1)
        : session.chunkSize;

      const writeResult = await chunkStore.writeChunk(
        uploadId,
        idx,
        part.file,
        expectedHash,
        expectedSize,
        isLastChunk
      );
      const persisted = await guardRedisDependency(reply, async () => {
        await redis.sadd(uploadKeys.chunks(uploadId), String(idx));
        return await touchUploadActivity({ uploadId, chunkIndex: idx });
      });
      if (persisted === REDIS_DEPENDENCY_UNAVAILABLE) return;
      if (!persisted) {
        await Promise.all([
          redis.srem(uploadKeys.chunks(uploadId), String(idx)).catch(() => {}),
          chunkStore.cleanup(uploadId).catch(() => {}),
        ]);
        const status = await redis
          .hget<string>(uploadKeys.meta(uploadId), "status")
          .catch(() => null);
        if (status === "expired") {
          return sendApiError(reply, 409, "UPLOAD_EXPIRED", "Upload session expired");
        }
        return sendApiError(reply, 404, "UPLOAD_NOT_FOUND", "Invalid uploadId");
      }

      const eventContext = requestEventContext(req);
      emitInfrastructureEvent(log, {
        event: "chunk_uploaded",
        requestId: eventContext.requestId,
        actor: eventContext.actor,
        uploadId,
        outcome: "success",
        statusCode: 200,
        bytes: expectedSize,
        metadata: {
          chunkIndex: idx,
          reused: writeResult.alreadyExisted,
          totalChunks: session.totalChunks,
        },
      });

      return {
        ok: true,
        chunkIndex: idx,
        ...(writeResult.alreadyExisted ? { reused: true } : {}),
      };
    } catch (err: any) {
      const message = err?.message ?? "Chunk upload failed";

      if (err?.message === "CHUNK_IN_PROGRESS") {
        log.info({ uploadId, idx }, "Chunk upload already in progress");
        return sendApiError(
          reply,
          409,
          "CHUNK_IN_PROGRESS",
          "Chunk upload already in progress, retry shortly",
          { retryable: true }
        );
      }

      if (
        err?.message === "HASH_MISMATCH" ||
        err?.message === "CHUNK_TOO_LARGE" ||
        err?.message === "CHUNK_SIZE_MISMATCH" ||
        err?.message === "INVALID_LAST_CHUNK_SIZE"
      ) {
        return sendApiError(reply, 400, "INVALID_CHUNK", message, {
          retryable: false,
        });
      }

      if (isRedisDependencyError(err)) {
        return sendRedisUnavailable(reply);
      }

      log.warn({ uploadId, idx, err }, "Chunk upload failed");
      return sendApiError(
        reply,
        500,
        "CHUNK_UPLOAD_FAILED",
        message,
        { retryable: true }
      );
    }
  });

  app.get("/v1/uploads/:uploadId/status", async (req, reply) => {
    const { uploadId } = req.params as { uploadId: string };
    const exposeBlobId = shouldExposeBlobId((req as any).query);
    const exposeWalrusDebug = shouldExposeWalrusDebug((req as any).query);

    if (!isUuid(uploadId)) {
      return sendApiError(reply, 400, "INVALID_UPLOAD_ID", "uploadId must be a UUID");
    }

    const redis = await requireRedis(reply);
    if (!redis) return;
    const statusProbe = await guardRedisDependency(reply, () =>
      redis.hget<string>(uploadKeys.meta(uploadId), "status")
    );
    if (statusProbe === REDIS_DEPENDENCY_UNAVAILABLE) return;
    const statusScope = statusProbe === "finalizing" ? "file_meta_read" : "upload_control";
    const statusLimit = await req.server.authProvider.checkRateLimit({
      req,
      scope: statusScope,
    });
    applyRateLimitHeaders(reply, statusLimit);
    if (!statusLimit.allowed) {
      return sendApiError(reply, 429, "RATE_LIMITED", "Rate limit exceeded", {
        retryable: true,
        details: {
          limit: statusLimit.limit,
          current: statusLimit.current,
          windowSeconds: statusLimit.windowSeconds,
          authenticated: statusLimit.identity.authenticated,
          authMethod: statusLimit.identity.method,
          scope: statusScope,
        },
      });
    }

    const snapshot = await guardRedisDependency(reply, () =>
      loadUploadStateSnapshot({
        redis,
        metaKey: uploadKeys.meta(uploadId),
        uploadId,
        getSession,
        expireUploadIfNeeded,
      })
    );
    if (snapshot === REDIS_DEPENDENCY_UNAVAILABLE) return;
    const { session, currentMeta } = snapshot;
    if (!session) {
      const status = currentMeta?.status;
      if (!status) {
        return sendApiError(reply, 404, "UPLOAD_NOT_FOUND", "Invalid uploadId");
      }
      const authzStatus = await req.server.authProvider.authorizeUploadAccess({
        req,
        action: "status",
        uploadId,
        uploadOwner: currentMeta?.owner ?? null,
      });
      if (!authzStatus.allowed) {
        return sendApiError(
          reply,
          uploadAuthzStatusCode(authzStatus.code),
          uploadAuthzErrorCode(authzStatus.code),
          authzStatus.message ?? "Upload access denied"
        );
      }

      let receivedChunks: number[];
      try {
        receivedChunks = await reconcileReceivedChunks(uploadId);
      } catch (err) {
        if (isRedisDependencyError(err)) {
          return sendRedisUnavailable(reply);
        }
        req.log.error({ err, uploadId }, "Chunk store reconciliation failed during status");
        reply.header("Retry-After", String(RETRYABLE_RETRY_AFTER_SECONDS));
        return sendApiError(
          reply,
          503,
          "CHUNK_STORE_UNAVAILABLE",
          "Upload chunk state is temporarily unavailable",
          { retryable: true }
        );
      }

      return buildUploadStatusResponse({
        uploadId,
        chunkSize: currentMeta?.chunkSize ? Number(currentMeta.chunkSize) : null,
        totalChunks: currentMeta?.totalChunks ? Number(currentMeta.totalChunks) : null,
        receivedChunks,
        expiresAt: currentMeta?.expiresAt ? Number(currentMeta.expiresAt) : null,
        status,
        meta: currentMeta,
        includeBlobId: exposeBlobId,
        includeWalrusDebug: exposeWalrusDebug,
        pollAfterMs: status === "finalizing" ? FINALIZE_POLL_AFTER_MS : undefined,
      });
    }
    const authzStatus = await req.server.authProvider.authorizeUploadAccess({
      req,
      action: "status",
      uploadId,
      uploadOwner: session.owner ?? null,
    });
    if (!authzStatus.allowed) {
      return sendApiError(
        reply,
        uploadAuthzStatusCode(authzStatus.code),
        uploadAuthzErrorCode(authzStatus.code),
        authzStatus.message ?? "Upload access denied"
      );
    }

    let receivedChunks: number[];
    try {
      receivedChunks = await reconcileReceivedChunks(uploadId);
    } catch (err) {
      if (isRedisDependencyError(err)) {
        return sendRedisUnavailable(reply);
      }
      req.log.error({ err, uploadId }, "Chunk store reconciliation failed during status");
      reply.header("Retry-After", String(RETRYABLE_RETRY_AFTER_SECONDS));
      return sendApiError(
        reply,
        503,
        "CHUNK_STORE_UNAVAILABLE",
        "Upload chunk state is temporarily unavailable",
        { retryable: true }
      );
    }

    return buildUploadStatusResponse({
      uploadId,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      receivedChunks,
      expiresAt: session.expiresAt,
      status: currentMeta?.status ?? session.status,
      meta: currentMeta,
      includeBlobId: exposeBlobId,
      includeWalrusDebug: exposeWalrusDebug,
      pollAfterMs:
        (currentMeta?.status ?? session.status) === "finalizing"
          ? FINALIZE_POLL_AFTER_MS
          : undefined,
    });
  });

  app.post("/v1/uploads/:uploadId/complete", async (req, reply) => {
    const log = req.log;
    const { uploadId } = req.params as { uploadId: string };
    const exposeBlobId = shouldExposeBlobId((req as any).query);
    const exposeWalrusDebug = shouldExposeWalrusDebug((req as any).query);
    const completeLimit = await req.server.authProvider.checkRateLimit({
      req,
      scope: "upload_control",
    });
    applyRateLimitHeaders(reply, completeLimit);
    if (!completeLimit.allowed) {
      return sendApiError(reply, 429, "RATE_LIMITED", "Rate limit exceeded", {
        retryable: true,
        details: {
          limit: completeLimit.limit,
          current: completeLimit.current,
          windowSeconds: completeLimit.windowSeconds,
          authenticated: completeLimit.identity.authenticated,
          authMethod: completeLimit.identity.method,
        },
      });
    }

    if (!isUuid(uploadId)) {
      return sendApiError(reply, 400, "INVALID_UPLOAD_ID", "uploadId must be a UUID");
    }

    const redis = await requireRedis(reply);
    if (!redis) return;
    const metaKey = uploadKeys.meta(uploadId);
    const snapshot = await guardRedisDependency(reply, () =>
      loadUploadStateSnapshot({
        redis,
        metaKey,
        uploadId,
        getSession,
        expireUploadIfNeeded,
      })
    );
    if (snapshot === REDIS_DEPENDENCY_UNAVAILABLE) return;
    const { session, currentMeta } = snapshot;
    const authzComplete = await req.server.authProvider.authorizeUploadAccess({
      req,
      action: "complete",
      uploadId,
      uploadOwner: session?.owner ?? currentMeta?.owner ?? null,
    });
    if (!authzComplete.allowed) {
      return sendApiError(
        reply,
        uploadAuthzStatusCode(authzComplete.code),
        uploadAuthzErrorCode(authzComplete.code),
        authzComplete.message ?? "Upload access denied"
      );
    }

    const idempotencyKey = getUploadIdempotencyKey(req);
    const idempotencyRedisKey = idempotencyKey
      ? uploadKeys.completeIdempotency(completeLimit.identity.subject, uploadId, idempotencyKey)
      : null;
    const idempotencyFingerprint = idempotencyRedisKey
      ? buildUploadActionFingerprint({
          subject: completeLimit.identity.subject,
          action: "complete",
          uploadId,
          includeBlobId: exposeBlobId,
          includeWalrusDebug: exposeWalrusDebug,
        })
      : null;
    if (idempotencyRedisKey && idempotencyFingerprint) {
      const replay = await guardRedisDependency(reply, () =>
        sendUploadActionIdempotencyReplay({
          reply,
          redis,
          key: idempotencyRedisKey,
          fingerprint: idempotencyFingerprint,
          conflictMessage: "Idempotency key was already used with a different complete request",
        })
      );
      if (replay === REDIS_DEPENDENCY_UNAVAILABLE) return;
      if (replay === "replayed" || replay === "conflict") return;
    }

    const metaStatus = currentMeta?.status;

    if (metaStatus === "expired") {
      return sendApiError(reply, 409, "UPLOAD_EXPIRED", "Upload session expired");
    }

    if (metaStatus === "finalizing") {
      const retryAfter = finalizePollRetryAfterSeconds();
      const responseBody = buildUploadCompleteFinalizingResponse({
        uploadId,
        pollAfterMs: FINALIZE_POLL_AFTER_MS,
        enqueued: false,
        inProgress: isUploadFinalizeQueued(uploadId),
        meta: currentMeta,
      });
      reply.header("Retry-After", retryAfter);
      await persistUploadActionIdempotencyRecord({
        redis,
        key: idempotencyRedisKey,
        fingerprint: idempotencyFingerprint,
        ttlMs: session?.expiresAt ? session.expiresAt - Date.now() : UploadConfig.sessionTtlMs,
        statusCode: 202,
        responseBody,
        retryAfter,
        log,
        uploadId,
      });
      return reply.code(202).send(responseBody);
    }

    if (!session) {
      if (metaStatus === "completed") {
        if (!currentMeta?.fileId || !currentMeta?.blobId) {
          return sendApiError(
            reply,
            500,
            "INTERNAL_ERROR",
            "Completed upload metadata is corrupt"
          );
        }

        const responseBody = buildUploadCompleteReadyResponse({
          fileId: currentMeta.fileId,
          blobId: currentMeta.blobId,
          sizeBytes: Number(currentMeta.sizeBytes ?? 0),
          includeBlobId: exposeBlobId,
          includeWalrusDebug: exposeWalrusDebug,
          meta: currentMeta,
        });
        await persistUploadActionIdempotencyRecord({
          redis,
          key: idempotencyRedisKey,
          fingerprint: idempotencyFingerprint,
          ttlMs: UploadConfig.sessionTtlMs,
          statusCode: 200,
          responseBody,
          log,
          uploadId,
        });
        return reply.code(200).send(responseBody);
      }

      return sendApiError(reply, 404, "UPLOAD_NOT_FOUND", "Invalid uploadId");
    }

    if (session.status === "completed" || metaStatus === "completed") {
      if (currentMeta?.fileId && currentMeta?.blobId) {
        const responseBody = buildUploadCompleteReadyResponse({
          fileId: currentMeta.fileId,
          blobId: currentMeta.blobId,
          sizeBytes: Number(currentMeta.sizeBytes ?? session.sizeBytes),
          includeBlobId: exposeBlobId,
          includeWalrusDebug: exposeWalrusDebug,
          meta: currentMeta,
        });
        await persistUploadActionIdempotencyRecord({
          redis,
          key: idempotencyRedisKey,
          fingerprint: idempotencyFingerprint,
          ttlMs: UploadConfig.sessionTtlMs,
          statusCode: 200,
          responseBody,
          log,
          uploadId,
        });
        return reply.code(200).send(responseBody);
      }

      return sendApiError(
        reply,
        409,
        "UPLOAD_ALREADY_COMPLETED",
        "Upload is already finalized"
      );
    }

    let receivedChunks: number;
    try {
      receivedChunks = (await reconcileReceivedChunks(uploadId)).length;
    } catch (err) {
      if (isRedisDependencyError(err)) {
        return sendRedisUnavailable(reply);
      }
      req.log.error({ err, uploadId }, "Chunk store reconciliation failed during complete");
      reply.header("Retry-After", String(RETRYABLE_RETRY_AFTER_SECONDS));
      return sendApiError(
        reply,
        503,
        "CHUNK_STORE_UNAVAILABLE",
        "Upload chunk state is temporarily unavailable",
        { retryable: true }
      );
    }

    if (receivedChunks !== session.totalChunks) {
      return sendApiError(
        reply,
        400,
        "UPLOAD_INCOMPLETE",
        `Only ${receivedChunks}/${session.totalChunks} chunks uploaded`,
        { retryable: true }
      );
    }

    const queued = await guardRedisDependency(reply, () =>
      enqueueUploadFinalize({ uploadId, log })
    );
    if (queued === REDIS_DEPENDENCY_UNAVAILABLE) return;
    if (queued.rejectedByBackpressure) {
      reply.header("Retry-After", finalizePollRetryAfterSeconds());
      return sendApiError(
        reply,
        503,
        "FINALIZE_QUEUE_BACKPRESSURE",
        "Finalize queue is saturated, retry shortly",
        { retryable: true }
      );
    }
    const retryAfter = finalizePollRetryAfterSeconds();
    reply.header("Retry-After", retryAfter);
    const eventContext = requestEventContext(req);
    emitInfrastructureEvent(log, {
      event: "finalize_requested",
      requestId: eventContext.requestId,
      actor: eventContext.actor,
      uploadId,
      outcome: "success",
      statusCode: 202,
      metadata: {
        enqueued: queued.enqueued,
        inProgress: isUploadFinalizeQueued(uploadId),
        receivedChunks,
        totalChunks: session.totalChunks,
      },
    });
    const responseBody = buildUploadCompleteFinalizingResponse({
      uploadId,
      pollAfterMs: FINALIZE_POLL_AFTER_MS,
      enqueued: queued.enqueued,
      inProgress: isUploadFinalizeQueued(uploadId),
      meta: currentMeta,
    });
    await persistUploadActionIdempotencyRecord({
      redis,
      key: idempotencyRedisKey,
      fingerprint: idempotencyFingerprint,
      ttlMs: session.expiresAt - Date.now(),
      statusCode: 202,
      responseBody,
      retryAfter,
      log,
      uploadId,
    });
    return reply.code(202).send(responseBody);
  });

  app.delete("/v1/uploads/:uploadId", async (req, reply) => {
    const log = req.log;
    const { uploadId } = req.params as { uploadId: string };
    const cancelLimit = await req.server.authProvider.checkRateLimit({
      req,
      scope: "upload_control",
    });
    applyRateLimitHeaders(reply, cancelLimit);
    if (!cancelLimit.allowed) {
      return sendApiError(reply, 429, "RATE_LIMITED", "Rate limit exceeded", {
        retryable: true,
        details: {
          limit: cancelLimit.limit,
          current: cancelLimit.current,
          windowSeconds: cancelLimit.windowSeconds,
          authenticated: cancelLimit.identity.authenticated,
          authMethod: cancelLimit.identity.method,
        },
      });
    }

    if (!isUuid(uploadId)) {
      return sendApiError(reply, 400, "INVALID_UPLOAD_ID", "uploadId must be a UUID");
    }

    const redis = await requireRedis(reply);
    if (!redis) return;
    const metaKey = uploadKeys.meta(uploadId);
    const lockKey = `${metaKey}:lock`;

    const loaded = await guardRedisDependency(reply, () =>
      Promise.all([
        loadUploadStateSnapshot({
          redis,
          metaKey,
          uploadId,
          getSession,
          expireUploadIfNeeded,
        }),
        redis.exists(lockKey),
        redis.sismember(uploadKeys.finalizePending(), uploadId),
      ] as const)
    );
    if (loaded === REDIS_DEPENDENCY_UNAVAILABLE) return;
    const [snapshot, hasLock, isFinalizePending] = loaded;
    const { session, currentMeta } = snapshot;
    const authzCancel = await req.server.authProvider.authorizeUploadAccess({
      req,
      action: "cancel",
      uploadId,
      uploadOwner: session?.owner ?? currentMeta?.owner ?? null,
    });
    if (!authzCancel.allowed) {
      return sendApiError(
        reply,
        uploadAuthzStatusCode(authzCancel.code),
        uploadAuthzErrorCode(authzCancel.code),
        authzCancel.message ?? "Upload access denied"
      );
    }

    const idempotencyKey = getUploadIdempotencyKey(req);
    const idempotencyRedisKey = idempotencyKey
      ? uploadKeys.cancelIdempotency(cancelLimit.identity.subject, uploadId, idempotencyKey)
      : null;
    const idempotencyFingerprint = idempotencyRedisKey
      ? buildUploadActionFingerprint({
          subject: cancelLimit.identity.subject,
          action: "cancel",
          uploadId,
        })
      : null;
    if (idempotencyRedisKey && idempotencyFingerprint) {
      const replay = await guardRedisDependency(reply, () =>
        sendUploadActionIdempotencyReplay({
          reply,
          redis,
          key: idempotencyRedisKey,
          fingerprint: idempotencyFingerprint,
          conflictMessage: "Idempotency key was already used with a different cancel request",
        })
      );
      if (replay === REDIS_DEPENDENCY_UNAVAILABLE) return;
      if (replay === "replayed" || replay === "conflict") return;
    }

    if (hasLock || currentMeta?.status === "finalizing" || isFinalizePending === 1) {
      reply.header("Retry-After", finalizePollRetryAfterSeconds());
      return sendApiError(
        reply,
        409,
        "UPLOAD_FINALIZATION_IN_PROGRESS",
        "Upload is currently finalizing"
      );
    }

    const status = currentMeta?.status;

    if (status === "expired") {
      const responseBody = buildUploadCancelResponse({ uploadId, status: "expired" });
      await persistUploadActionIdempotencyRecord({
        redis,
        key: idempotencyRedisKey,
        fingerprint: idempotencyFingerprint,
        ttlMs: UploadConfig.sessionTtlMs,
        statusCode: 200,
        responseBody,
        log,
        uploadId,
      });
      return reply.code(200).send(responseBody);
    }

    if (!session) {
      if (!status) {
        return sendApiError(reply, 404, "UPLOAD_NOT_FOUND", "Invalid uploadId");
      }

      if (status === "completed") {
        return sendApiError(
          reply,
          409,
          "UPLOAD_ALREADY_COMPLETED",
          "Upload is already finalized"
        );
      }

      if (status === "canceled" || status === "failed" || status === "expired") {
        const cleanupResults = await Promise.allSettled([
          chunkStore.cleanup(uploadId),
          fs.rm(finalBinPath(uploadId), { force: true }),
        ]);
        const cleanupOk = cleanupResults.every((result) => result.status === "fulfilled");
        if (cleanupOk) {
          await redis
            .multi()
            .srem(uploadKeys.gcIndex(), uploadId)
            .srem(uploadKeys.activeIndex(), uploadId)
            .exec();
        }
        const responseBody = buildUploadCancelResponse({ uploadId, status });
        await persistUploadActionIdempotencyRecord({
          redis,
          key: idempotencyRedisKey,
          fingerprint: idempotencyFingerprint,
          ttlMs: UploadConfig.sessionTtlMs,
          statusCode: 200,
          responseBody,
          log,
          uploadId,
        });
        return reply.code(200).send(responseBody);
      }

      const markedCanceled = await guardRedisDependency(reply, () =>
        redis.hset(metaKey, {
          status: "canceled",
          canceledAt: String(Date.now()),
        })
      );
      if (markedCanceled === REDIS_DEPENDENCY_UNAVAILABLE) return;

      await Promise.all([
        chunkStore.cleanup(uploadId).catch(() => {}),
        fs.rm(finalBinPath(uploadId), { force: true }).catch(() => {}),
      ]);

      const cleaned = await guardRedisDependency(reply, () =>
        redis
          .multi()
          .del(uploadKeys.session(uploadId))
          .del(uploadKeys.chunks(uploadId))
          .srem(uploadKeys.gcIndex(), uploadId)
          .srem(uploadKeys.activeIndex(), uploadId)
          .exec()
      );
      if (cleaned === REDIS_DEPENDENCY_UNAVAILABLE) return;

      log.info({ uploadId }, "Upload canceled");
      const eventContext = requestEventContext(req);
      emitInfrastructureEvent(log, {
        event: "upload_canceled",
        requestId: eventContext.requestId,
        actor: eventContext.actor,
        uploadId,
        outcome: "success",
        statusCode: 200,
        metadata: {
          status: "canceled",
        },
      });
      const responseBody = buildUploadCancelResponse({ uploadId, status: "canceled" });
      await persistUploadActionIdempotencyRecord({
        redis,
        key: idempotencyRedisKey,
        fingerprint: idempotencyFingerprint,
        ttlMs: UploadConfig.sessionTtlMs,
        statusCode: 200,
        responseBody,
        log,
        uploadId,
      });
      return reply.code(200).send(responseBody);
    }

    if (status === "completed" || session.status === "completed") {
      return sendApiError(
        reply,
        409,
        "UPLOAD_ALREADY_COMPLETED",
        "Upload is already finalized"
      );
    }

    const markedCanceled = await guardRedisDependency(reply, () =>
      redis.hset(metaKey, {
        status: "canceled",
        canceledAt: String(Date.now()),
      })
    );
    if (markedCanceled === REDIS_DEPENDENCY_UNAVAILABLE) return;

    await Promise.all([
      chunkStore.cleanup(uploadId).catch(() => {}),
      fs.rm(finalBinPath(uploadId), { force: true }).catch(() => {}),
    ]);

    const cleaned = await guardRedisDependency(reply, () =>
      redis
        .multi()
        .del(uploadKeys.session(uploadId))
        .del(uploadKeys.chunks(uploadId))
        .srem(uploadKeys.gcIndex(), uploadId)
        .srem(uploadKeys.activeIndex(), uploadId)
        .exec()
    );
    if (cleaned === REDIS_DEPENDENCY_UNAVAILABLE) return;

    log.info({ uploadId }, "Upload canceled");
    const eventContext = requestEventContext(req);
    emitInfrastructureEvent(log, {
      event: "upload_canceled",
      requestId: eventContext.requestId,
      actor: eventContext.actor,
      uploadId,
      outcome: "success",
      statusCode: 200,
        metadata: {
          status: "canceled",
        },
      });
    const responseBody = buildUploadCancelResponse({ uploadId, status: "canceled" });
    await persistUploadActionIdempotencyRecord({
      redis,
      key: idempotencyRedisKey,
      fingerprint: idempotencyFingerprint,
      ttlMs: UploadConfig.sessionTtlMs,
      statusCode: 200,
      responseBody,
      log,
      uploadId,
    });
    return reply.code(200).send(responseBody);
  });

}
