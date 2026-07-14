import { Redis } from "ioredis";
import type { RequestHandler } from "express";
import { consola } from "consola";
import { env } from "./env";

/**
 * Optional Redis cache. When REDIS_URL is unset (or Redis is unreachable) every
 * helper degrades to a no-op / passthrough, so the API keeps working without it.
 */
let client: Redis | null = null;

if (env.REDIS_URL) {
  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  client.on("error", (err) => consola.warn("[redis]", err.message));
  client.on("ready", () => consola.success("[redis] connected"));
} else {
  consola.info("[redis] REDIS_URL not set — caching disabled");
}

export async function cacheGet(key: string): Promise<string | null> {
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSec: number,
): Promise<void> {
  if (!client) return;
  try {
    await client.set(key, value, "EX", ttlSec);
  } catch {
    /* ignore cache write failures */
  }
}

/**
 * Express middleware that caches successful (200) JSON responses by request URL
 * for `ttlSec`. Adds `X-Cache: HIT|MISS`.
 */
export function cacheJson(ttlSec: number): RequestHandler {
  return async (req, res, next) => {
    if (!client) return next();
    const key = `resp:${req.originalUrl}`;
    const hit = await cacheGet(key);
    if (hit) {
      res.setHeader("X-Cache", "HIT");
      res.type("application/json").send(hit);
      return;
    }
    const orig = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode === 200) void cacheSet(key, JSON.stringify(body), ttlSec);
      res.setHeader("X-Cache", "MISS");
      return orig(body);
    }) as typeof res.json;
    next();
  };
}
