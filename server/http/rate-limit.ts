import "server-only";
import { isIP } from "node:net";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/server/env";
import { ApiError, Errors } from "./errors";

export const policies = {
  "auth:signin":  { n: 5,   window: "1 m"  as Duration }, // key: ip + lowercased email
  "auth:signup":  { n: 5,   window: "1 h"  as Duration }, // key: ip
  "auth:reset":   { n: 3,   window: "1 h"  as Duration }, // key: email
  "auth:verify":  { n: 3,   window: "1 h"  as Duration }, // key: email
  "api:default":  { n: 120, window: "1 m"  as Duration }, // key: userId
  "gen:start":    { n: 20,  window: "1 m"  as Duration }, // key: userId (plan caps are in Step 8.1)
  "upload":       { n: 30,  window: "10 m" as Duration }, // key: userId
  "share:create": { n: 20,  window: "1 h"  as Duration },
  "invite:send":  { n: 20,  window: "1 h"  as Duration },
  "support:send": { n: 3,   window: "1 h"  as Duration }, // key: ip or userId
} as const;

export type RateLimitPolicy = keyof typeof policies;

function parseWindowMs(window: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(window.trim());
  if (!match) return 60_000;
  const amount = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s":
      return amount * 1_000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 3_600_000;
    case "d":
      return amount * 86_400_000;
    default:
      return 60_000;
  }
}

export type RateLimitCheckResult = {
  success: boolean;
  reset: number; // epoch ms when window resets
  remaining: number;
};

export type RateLimitBackend = (
  policy: RateLimitPolicy,
  key: string
) => Promise<RateLimitCheckResult>;

// In-memory sliding window store for development & unit tests
const memoryWindows = new Map<string, number[]>();

export function resetInMemoryRateLimits(): void {
  memoryWindows.clear();
  memorySecondaryStore.clear();
}

export async function checkInMemoryLimit(
  policy: RateLimitPolicy,
  key: string,
  now = Date.now()
): Promise<RateLimitCheckResult> {
  const { n, window } = policies[policy];
  const windowMs = parseWindowMs(window);
  const bucketKey = `rl:${policy}:${key}`;

  const existing = memoryWindows.get(bucketKey) ?? [];
  const windowStart = now - windowMs;
  const active = existing.filter((ts) => ts > windowStart);

  if (active.length >= n) {
    memoryWindows.set(bucketKey, active);
    const oldest = active[0] ?? now;
    return {
      success: false,
      reset: oldest + windowMs,
      remaining: 0,
    };
  }

  active.push(now);
  memoryWindows.set(bucketKey, active);

  return {
    success: true,
    reset: (active[0] ?? now) + windowMs,
    remaining: Math.max(0, n - active.length),
  };
}

let redisClient: Redis | null = null;
const upstashLimiters = new Map<RateLimitPolicy, Ratelimit>();

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    return redisClient;
  }
  return null;
}

function getUpstashLimiter(policy: RateLimitPolicy): Ratelimit | null {
  const existing = upstashLimiters.get(policy);
  if (existing) return existing;

  const redis = getRedisClient();
  if (!redis) return null;

  const { n, window } = policies[policy];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(n, window),
    prefix: `klecx:rl:${policy}`,
  });
  upstashLimiters.set(policy, limiter);
  return limiter;
}

let customBackendOverride: RateLimitBackend | null = null;

/**
 * Allows unit tests to inject a custom backend (e.g. to simulate Redis outages).
 */
export function setRateLimitBackendForTests(
  backend: RateLimitBackend | null
): void {
  customBackendOverride = backend;
}

/**
 * Validates and normalizes an IPv4 or IPv6 address string.
 * Returns `null` if the string is empty or not a valid IP literal.
 */
export function normalizeAndValidateIp(raw: string): string | null {
  let candidate = raw.trim();
  if (!candidate) return null;

  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1).trim();
  }

  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const mappedIpv4 = candidate.slice(7).trim();
    if (isIP(mappedIpv4) === 4) {
      return mappedIpv4;
    }
  }

  const version = isIP(candidate);
  if (version === 4) return candidate;
  if (version === 6) return candidate.toLowerCase();
  return null;
}

/**
 * Reads and validates the client IP from headers guaranteed by the deployment's
 * trusted reverse proxy (`x-forwarded-for` first entry, or `x-real-ip`).
 *
 * Required proxy configuration when `TRUST_PROXY=true`:
 * - Vercel / Cloudflare: edge network automatically overwrites forwarded IP headers.
 * - Nginx / reverse proxy: must strip or overwrite incoming client headers
 *   (e.g. `proxy_set_header X-Forwarded-For $remote_addr;` and
 *   `proxy_set_header X-Real-IP $remote_addr;`).
 */
export function readTrustedProxyAddress(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff !== null) {
    const first = xff.split(",")[0];
    if (!first) return null;
    return normalizeAndValidateIp(first);
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp !== null) {
    return normalizeAndValidateIp(realIp);
  }

  return null;
}

/**
 * Resolves the client IP address safely.
 * Reads forwarded proxy headers ONLY when `trustProxy` (`TRUST_PROXY=true`) is enabled.
 * Returns `null` (never a shared `"127.0.0.1"` fallback) when `trustProxy` is false
 * or when no valid proxy address header is present.
 */
export function resolveClientIp(
  req: Request,
  trustProxy: boolean = env.TRUST_PROXY
): string | null {
  if (!trustProxy) return null;
  return readTrustedProxyAddress(req);
}

/**
 * Alias for `resolveClientIp`.
 */
export function getClientIp(
  req: Request,
  trustProxy: boolean = env.TRUST_PROXY
): string | null {
  return resolveClientIp(req, trustProxy);
}

/**
 * Enforces sliding-window rate limiting for the given policy and key.
 * - Throws `Errors.rateLimited(retryAfter)` (429) when limit is exceeded.
 * - If Redis throws an operational error (or is missing in production):
 *   - Fails CLOSED (429) for `auth:*` policies.
 *   - Fails OPEN (logs & continues) for all other policies.
 */
export async function limit(
  policy: RateLimitPolicy,
  key: string
): Promise<void> {
  try {
    let result: RateLimitCheckResult;

    if (customBackendOverride) {
      result = await customBackendOverride(policy, key);
    } else {
      const upstash = getUpstashLimiter(policy);
      if (upstash) {
        const r = await upstash.limit(key);
        result = {
          success: r.success,
          reset: r.reset,
          remaining: r.remaining,
        };
      } else if (env.NODE_ENV === "production") {
        throw new Error(
          "Upstash Redis credentials are required for rate limiting in production"
        );
      } else {
        result = await checkInMemoryLimit(policy, key);
      }
    }

    if (!result.success) {
      const retryAfter = Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000)
      );
      throw Errors.rateLimited(retryAfter);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }

    // Operational / Redis error: fail closed for auth:*, fail open for others
    if (policy.startsWith("auth:")) {
      console.error(
        `[rate-limit] Backend error on ${policy}; failing closed:`,
        String(err)
      );
      throw Errors.rateLimited(60);
    }

    console.error(
      `[rate-limit] Backend error on ${policy}; failing open:`,
      String(err)
    );
  }
}

// Secondary storage for Better Auth (backed by Upstash Redis or in-memory TTL map)
type SecondaryStoreEntry = {
  value: string;
  expiresAt: number | null;
};

const memorySecondaryStore = new Map<string, SecondaryStoreEntry>();

function isSecondaryEntryExpired(
  entry: SecondaryStoreEntry,
  now = Date.now()
): boolean {
  return entry.expiresAt !== null && now >= entry.expiresAt;
}

export const authSecondaryStorage = {
  async get(key: string): Promise<string | null> {
    const redis = getRedisClient();
    if (redis) {
      const val = await redis.get<string>(`klecx:auth:${key}`);
      if (val === null || val === undefined) return null;
      return typeof val === "string" ? val : JSON.stringify(val);
    }

    const entry = memorySecondaryStore.get(key);
    if (!entry) return null;
    if (isSecondaryEntryExpired(entry)) {
      memorySecondaryStore.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      if (ttl && ttl > 0) {
        await redis.set(`klecx:auth:${key}`, value, { ex: ttl });
      } else {
        await redis.set(`klecx:auth:${key}`, value);
      }
      return;
    }

    memorySecondaryStore.set(key, {
      value,
      expiresAt: ttl && ttl > 0 ? Date.now() + ttl * 1000 : null,
    });
  },

  async delete(key: string): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      await redis.del(`klecx:auth:${key}`);
      return;
    }

    memorySecondaryStore.delete(key);
  },

  async getAndDelete(key: string): Promise<string | null> {
    const redis = getRedisClient();
    if (redis) {
      const val = await redis.getdel<string>(`klecx:auth:${key}`);
      if (val === null || val === undefined) return null;
      return typeof val === "string" ? val : JSON.stringify(val);
    }

    // Read, delete, and check expiry synchronously without any `await` in between
    // so concurrent callers can never consume the same single-use token twice.
    const entry = memorySecondaryStore.get(key);
    memorySecondaryStore.delete(key);

    if (!entry || isSecondaryEntryExpired(entry)) {
      return null;
    }

    return entry.value;
  },

  async increment(key: string, ttl: number): Promise<number> {
    const redis = getRedisClient();
    if (redis) {
      const redisKey = `klecx:auth:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1 && ttl > 0) {
        await redis.expire(redisKey, ttl);
      }
      return count;
    }

    const now = Date.now();
    const existing = memorySecondaryStore.get(key);
    if (!existing || isSecondaryEntryExpired(existing, now)) {
      memorySecondaryStore.set(key, {
        value: "1",
        expiresAt: ttl > 0 ? now + ttl * 1000 : null,
      });
      return 1;
    }

    const nextCount = (Number(existing.value) || 0) + 1;
    memorySecondaryStore.set(key, {
      value: String(nextCount),
      expiresAt: existing.expiresAt,
    });
    return nextCount;
  },
};
