import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379/5";

const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});

let connectionFailed = false;

const ensureConnected = async () => {
  if (connectionFailed || redis.status === "ready") return !connectionFailed;

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    return true;
  } catch (error) {
    connectionFailed = true;
    console.warn("[cache] Redis unavailable, falling back to no caching.", error.message);
    return false;
  }
};

/**
 * Returns the cached JSON value for `key`, or computes it via `fn`,
 * caches it for `ttlSeconds`, and returns it. Falls back to calling
 * `fn` directly (no caching) if Redis is unreachable.
 */
export const getOrSet = async (key, ttlSeconds, fn) => {
  const connected = await ensureConnected();

  if (connected) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      console.warn("[cache] read failed", error.message);
    }
  }

  const value = await fn();

  if (connected) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      console.warn("[cache] write failed", error.message);
    }
  }

  return value;
};
