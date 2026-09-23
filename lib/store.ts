import { Redis } from "@upstash/redis";

/** The handful of hash operations the game needs. */
export interface Store {
  hget(key: string, field: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, unknown>>;
  hset(key: string, values: Record<string, string | number>): Promise<void>;
  /** Sets only if the field doesn't exist. Returns true if it was set. */
  hsetnx(key: string, field: string, value: string): Promise<boolean>;
  hincrby(key: string, field: string, by: number): Promise<number>;
  hlen(key: string): Promise<number>;
  del(key: string): Promise<void>;
}

function redisStore(url: string, token: string): Store {
  const r = new Redis({ url, token });
  return {
    hget: (k, f) => r.hget(k, f),
    hgetall: async (k) => (await r.hgetall<Record<string, unknown>>(k)) ?? {},
    hset: async (k, v) => {
      if (Object.keys(v).length) await r.hset(k, v);
    },
    hsetnx: async (k, f, v) => (await r.hsetnx(k, f, v)) === 1,
    hincrby: (k, f, by) => r.hincrby(k, f, by),
    hlen: (k) => r.hlen(k),
    del: async (k) => {
      await r.del(k);
    },
  };
}

/** Local-dev fallback. Not shared between serverless instances — don't use in production. */
function memoryStore(): Store {
  const g = globalThis as unknown as { __feudMem?: Map<string, Map<string, unknown>> };
  const db = (g.__feudMem ??= new Map());
  const h = (k: string) => {
    if (!db.has(k)) db.set(k, new Map());
    return db.get(k)!;
  };
  return {
    hget: async (k, f) => h(k).get(f) ?? null,
    hgetall: async (k) => Object.fromEntries(h(k)),
    hset: async (k, v) => {
      for (const [f, val] of Object.entries(v)) h(k).set(f, val);
    },
    hsetnx: async (k, f, v) => {
      if (h(k).has(f)) return false;
      h(k).set(f, v);
      return true;
    },
    hincrby: async (k, f, by) => {
      const n = Number(h(k).get(f) ?? 0) + by;
      h(k).set(f, n);
      return n;
    },
    hlen: async (k) => h(k).size,
    del: async (k) => {
      db.delete(k);
    },
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    cached = redisStore(url, token);
  } else {
    if (process.env.VERCEL) {
      console.warn("[survey-says] No Redis configured — using in-memory store. Answers will not be shared or saved.");
    }
    cached = memoryStore();
  }
  return cached;
}

/** Upstash auto-parses JSON strings; the memory store doesn't. Accept both. */
export function parseJSON<T>(v: unknown): T | null {
  if (v == null) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}
