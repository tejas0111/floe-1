import type { RedisClient, RedisMulti, RedisSetOptions } from "../../src/state/redis.types.ts";

type ExpiryMap = Map<string, number>;

function cloneHash(map: Map<string, string>): Record<string, string> {
  return Object.fromEntries(map.entries());
}

function isExpired(expires: ExpiryMap, key: string): boolean {
  const at = expires.get(key);
  return at !== undefined && at <= Date.now();
}

function normalizeScore(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

class InMemoryRedisMulti implements RedisMulti {
  private readonly commands: Array<() => Promise<unknown>> = [];

  constructor(private readonly client: InMemoryRedisClient) {}

  hset(key: string, kv: Record<string, unknown>) {
    this.commands.push(() => this.client.hset(key, kv));
    return this;
  }

  expire(key: string, seconds: number) {
    this.commands.push(() => this.client.expire(key, seconds));
    return this;
  }

  sadd(key: string, member: string) {
    this.commands.push(() => this.client.sadd(key, member));
    return this;
  }

  del(key: string) {
    this.commands.push(() => this.client.del(key));
    return this;
  }

  srem(key: string, member: string) {
    this.commands.push(() => this.client.srem(key, member));
    return this;
  }

  async exec() {
    const results: unknown[] = [];
    for (const command of this.commands) {
      results.push(await command());
    }
    return results;
  }
}

export class InMemoryRedisClient implements RedisClient {
  private readonly strings = new Map<string, string>();
  private readonly hashes = new Map<string, Map<string, string>>();
  private readonly sets = new Map<string, Set<string>>();
  private readonly lists = new Map<string, string[]>();
  private readonly zsets = new Map<string, Map<string, number>>();
  private readonly expires = new Map<string, number>();

  reset() {
    this.strings.clear();
    this.hashes.clear();
    this.sets.clear();
    this.lists.clear();
    this.zsets.clear();
    this.expires.clear();
  }

  async ping() {
    return "PONG";
  }

  private purgeIfExpired(key: string) {
    if (!isExpired(this.expires, key)) return;
    this.strings.delete(key);
    this.hashes.delete(key);
    this.sets.delete(key);
    this.lists.delete(key);
    this.zsets.delete(key);
    this.expires.delete(key);
  }

  private ensureNotExpired(key: string) {
    this.purgeIfExpired(key);
  }

  private hasAny(key: string): boolean {
    this.ensureNotExpired(key);
    return (
      this.strings.has(key) ||
      this.hashes.has(key) ||
      this.sets.has(key) ||
      this.lists.has(key) ||
      this.zsets.has(key)
    );
  }

  private getHash(key: string): Map<string, string> {
    this.ensureNotExpired(key);
    let map = this.hashes.get(key);
    if (!map) {
      map = new Map<string, string>();
      this.hashes.set(key, map);
    }
    return map;
  }

  private getSet(key: string): Set<string> {
    this.ensureNotExpired(key);
    let set = this.sets.get(key);
    if (!set) {
      set = new Set<string>();
      this.sets.set(key, set);
    }
    return set;
  }

  private getList(key: string): string[] {
    this.ensureNotExpired(key);
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    return list;
  }

  private getZSet(key: string): Map<string, number> {
    this.ensureNotExpired(key);
    let zset = this.zsets.get(key);
    if (!zset) {
      zset = new Map<string, number>();
      this.zsets.set(key, zset);
    }
    return zset;
  }

  private setExpiry(key: string, seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      this.expires.delete(key);
      return;
    }
    this.expires.set(key, Date.now() + seconds * 1000);
  }

  private removeKey(key: string): number {
    this.ensureNotExpired(key);
    let removed = 0;
    if (this.strings.delete(key)) removed += 1;
    if (this.hashes.delete(key)) removed += 1;
    if (this.sets.delete(key)) removed += 1;
    if (this.lists.delete(key)) removed += 1;
    if (this.zsets.delete(key)) removed += 1;
    this.expires.delete(key);
    return removed > 0 ? 1 : 0;
  }

  async hset(key: string, kv: Record<string, unknown>) {
    const hash = this.getHash(key);
    for (const [field, value] of Object.entries(kv)) {
      hash.set(field, String(value));
    }
    return "OK";
  }

  async hgetall<T = Record<string, string>>(key: string): Promise<T> {
    const hash = this.hashes.get(key);
    if (!hash || isExpired(this.expires, key)) {
      this.purgeIfExpired(key);
      return {} as T;
    }
    return cloneHash(hash) as T;
  }

  async hget<T = string>(key: string, field: string): Promise<T | null> {
    this.ensureNotExpired(key);
    const hash = this.hashes.get(key);
    return (hash?.get(field) ?? null) as T | null;
  }

  async scard(key: string): Promise<unknown> {
    this.ensureNotExpired(key);
    return this.sets.get(key)?.size ?? 0;
  }

  async smembers<T = string[]>(key: string): Promise<T> {
    this.ensureNotExpired(key);
    return Array.from(this.sets.get(key) ?? []) as T;
  }

  async sismember(key: string, member: string): Promise<unknown> {
    this.ensureNotExpired(key);
    return this.sets.get(key)?.has(member) ? 1 : 0;
  }

  async sadd(key: string, member: string): Promise<unknown> {
    const set = this.getSet(key);
    const sizeBefore = set.size;
    set.add(member);
    return set.size > sizeBefore ? 1 : 0;
  }

  async srem(key: string, member: string): Promise<unknown> {
    this.ensureNotExpired(key);
    return this.sets.get(key)?.delete(member) ? 1 : 0;
  }

  async zrem(key: string, member: string): Promise<unknown> {
    this.ensureNotExpired(key);
    return this.zsets.get(key)?.delete(member) ? 1 : 0;
  }

  async ttl(key: string): Promise<unknown> {
    this.ensureNotExpired(key);
    if (!this.hasAny(key)) return -2;
    const expiresAt = this.expires.get(key);
    if (expiresAt === undefined) return -1;
    const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async llen(key: string): Promise<unknown> {
    this.ensureNotExpired(key);
    return this.lists.get(key)?.length ?? 0;
  }

  async rpop<T = string>(key: string): Promise<T | null> {
    const list = this.getList(key);
    const value = list.pop();
    return (value ?? null) as T | null;
  }

  async lrem(key: string, count: number, value: string): Promise<unknown> {
    this.ensureNotExpired(key);
    const list = this.lists.get(key);
    if (!list || list.length === 0) return 0;

    let removed = 0;
    if (count === 0) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] === value) {
          list.splice(i, 1);
          removed += 1;
        }
      }
      return removed;
    }

    const step = count > 0 ? 1 : -1;
    let remaining = Math.abs(count);
    let i = count > 0 ? 0 : list.length - 1;
    while (i >= 0 && i < list.length && remaining > 0) {
      if (list[i] === value) {
        list.splice(i, 1);
        removed += 1;
        remaining -= 1;
        if (step < 0) {
          i -= 1;
          continue;
        }
      }
      i += step;
    }
    return removed;
  }

  async exists(key: string): Promise<unknown> {
    return this.hasAny(key) ? 1 : 0;
  }

  async del(key: string): Promise<unknown> {
    return this.removeKey(key);
  }

  async hincrby(key: string, field: string, increment: number): Promise<unknown> {
    const hash = this.getHash(key);
    const next = Number(hash.get(field) ?? 0) + increment;
    hash.set(field, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<unknown> {
    if (!this.hasAny(key)) return 0;
    this.setExpiry(key, seconds);
    return 1;
  }

  async set(key: string, value: string, options?: RedisSetOptions): Promise<unknown> {
    if (options?.nx && this.hasAny(key)) {
      return null;
    }
    this.strings.set(key, value);
    if (options?.ex !== undefined) {
      this.setExpiry(key, options.ex);
    } else {
      this.expires.delete(key);
    }
    return "OK";
  }

  private zadd(key: string, score: unknown, member: string) {
    const zset = this.getZSet(key);
    zset.set(member, normalizeScore(score));
    return 1;
  }

  private zrangeWithScores(key: string, start: number, stop: number): [string, string] {
    this.ensureNotExpired(key);
    const zset = this.zsets.get(key);
    if (!zset || zset.size === 0) return ["", ""];
    const entries = Array.from(zset.entries()).sort((a, b) => a[1] - b[1]);
    const idx = start < 0 ? Math.max(0, entries.length + start) : start;
    const item = entries[Math.min(idx, entries.length - 1)];
    return item ? [item[0], String(item[1])] : ["", ""];
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    const src = script.replace(/\s+/g, " ").trim();

    if (src.includes('if redis.call("GET", KEYS[1]) == ARGV[1]') && src.includes('redis.call("EXPIRE", KEYS[1]')) {
      const key = keys[0];
      if (this.strings.get(key) === args[0]) {
        return this.expire(key, Number(args[1]));
      }
      return 0;
    }

    if (src.includes('if redis.call("GET", KEYS[1]) == ARGV[1]') && src.includes('redis.call("DEL", KEYS[1])')) {
      const key = keys[0];
      if (this.strings.get(key) === args[0]) {
        return this.del(key);
      }
      return 0;
    }

    if (src.includes('if redis.call("EXISTS", sessionKey) == 0 then') && src.includes('redis.call("HSET", sessionKey')) {
      const [sessionKey, metaKey, gcKey, activeKey] = keys;
      if (!this.hasAny(sessionKey)) return 0;
      this.ensureNotExpired(metaKey);
      const status = this.hashes.get(metaKey)?.get("status") ?? null;
      if (status !== null && status !== "uploading") return 0;
      const uploadId = args[0];
      const sessionTtl = Number(args[1]);
      const metaTtl = Number(args[2]);
      const kv = args.slice(3);
      const fields: Record<string, string> = {};
      for (let i = 0; i < kv.length; i += 2) {
        const field = kv[i];
        const value = kv[i + 1];
        if (field !== undefined && value !== undefined) fields[field] = value;
      }
      this.getHash(sessionKey);
      for (const [field, value] of Object.entries(fields)) {
        this.hashes.get(sessionKey)!.set(field, value);
      }
      this.setExpiry(sessionKey, sessionTtl);
      this.getHash(metaKey);
      for (const [field, value] of Object.entries(fields)) {
        this.hashes.get(metaKey)!.set(field, value);
      }
      this.setExpiry(metaKey, metaTtl);
      this.getSet(gcKey).add(uploadId);
      this.getSet(activeKey).add(uploadId);
      return 1;
    }

    if (src.includes('local key = KEYS[1]') && src.includes('local nowMs = tonumber(ARGV[3])') && src.includes('local count = tonumber(redis.call("SCARD", key))')) {
      const [key] = keys;
      const max = Number(args[0]);
      const uploadId = args[1];
      const nowMs = Number(args[2]);
      const activeIds = Array.from(this.sets.get(key) ?? []);
      for (const activeUploadId of activeIds) {
        const metaKey = `floe:v1:upload:${activeUploadId}:meta`;
        const sessionKey = `floe:v1:upload:${activeUploadId}:session`;
        this.ensureNotExpired(metaKey);
        this.ensureNotExpired(sessionKey);
        const status = this.hashes.get(metaKey)?.get("status") ?? null;
        const expiresAt = Number(this.hashes.get(metaKey)?.get("expiresAt") ?? 0);
        const hasSession = this.hasAny(sessionKey);
        if (
          status === "completed" ||
          status === "failed" ||
          status === "canceled" ||
          status === "expired" ||
          (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= nowMs) ||
          !hasSession
        ) {
          this.getSet(key).delete(activeUploadId);
        }
      }
      const count = Number(this.sets.get(key)?.size ?? 0);
      if (count >= max) return 0;
      this.getSet(key).add(uploadId);
      return 1;
    }

    if (src.includes('local pendingKey = KEYS[1]') && src.includes('redis.call("LPUSH", queueKey, uploadId)') && src.includes('return added')) {
      const [pendingKey, queueKey, pendingSinceKey] = keys;
      const uploadId = args[0];
      const queuedAt = args[1];
      const pendingSet = this.getSet(pendingKey);
      const added = pendingSet.has(uploadId) ? 0 : 1;
      pendingSet.add(uploadId);
      if (Number(added) === 1) {
        this.getList(queueKey).unshift(uploadId);
        this.getZSet(pendingSinceKey).set(uploadId, normalizeScore(queuedAt));
      }
      return added;
    }

    if (src.includes('redis.call("SADD", KEYS[1], ARGV[1])') && src.includes('redis.call("LPUSH", KEYS[2], ARGV[1])') && src.includes('redis.call("ZADD", KEYS[3], ARGV[2], ARGV[1])') && src.includes('return 1')) {
      const [pendingKey, queueKey, pendingSinceKey] = keys;
      const uploadId = args[0];
      const queuedAt = args[1];
      this.getSet(pendingKey).add(uploadId);
      this.getList(queueKey).unshift(uploadId);
      this.getZSet(pendingSinceKey).set(uploadId, normalizeScore(queuedAt));
      return 1;
    }

    if (src.includes('redis.call("HSET", metaKey, "status", "finalizing", "finalizingQueuedAt", queuedAt)') && src.includes('redis.call("LLEN", queueKey) >= maxDepth')) {
      const [metaKey, pendingKey, queueKey, pendingSinceKey] = keys;
      const uploadId = args[0];
      const queuedAt = args[1];
      const maxDepth = Number(args[2]);
      this.getHash(metaKey).set("status", "finalizing");
      this.hashes.get(metaKey)!.set("finalizingQueuedAt", queuedAt);
      if (this.getSet(pendingKey).has(uploadId)) return 0;
      if ((this.getList(queueKey).length) >= maxDepth) return -1;
      this.getSet(pendingKey).add(uploadId);
      this.getList(queueKey).unshift(uploadId);
      this.getZSet(pendingSinceKey).set(uploadId, normalizeScore(queuedAt));
      return 1;
    }

    if (src.includes('local depth = redis.call("LLEN", KEYS[1])') && src.includes('redis.call("ZRANGE", KEYS[3], 0, 0, "WITHSCORES")')) {
      const [queueKey, pendingKey, pendingSinceKey] = keys;
      const depth = this.getList(queueKey).length;
      const pending = this.getSet(pendingKey).size;
      const oldest = this.zrangeWithScores(pendingSinceKey, 0, 0);
      const oldestScore = oldest[1] || null;
      return [depth, pending, oldestScore];
    }

    if (src.includes('redis.call("ZADD", KEYS[1], ARGV[2], ARGV[1]); return 1')) {
      await this.zadd(keys[0], args[1], args[0]);
      return 1;
    }

    throw new Error(`Unsupported redis.eval script: ${src.slice(0, 120)}`);
  }

  private async lpush(key: string, value: string) {
    const list = this.getList(key);
    list.unshift(value);
    return list.length;
  }

  multi() {
    return new InMemoryRedisMulti(this);
  }

  async close() {}
}

export function createInMemoryRedisClient(): InMemoryRedisClient {
  return new InMemoryRedisClient();
}
