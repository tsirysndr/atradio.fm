import { EventEmitter } from "node:events";
import { Redis } from "ioredis";
import { consola } from "consola";
import type { LiveEvent } from "@atradio/lexicons";
import { env } from "../env";

/**
 * Per-station live event bus for the SSE endpoint. Comments and reactions are
 * published here by the Jetstream consumer and streamed to any client watching
 * that station.
 *
 * The server (SSE) and consumer may run as separate processes, so when Redis is
 * configured we fan out through a Redis pub/sub channel; otherwise (combined
 * process / dev) an in-process EventEmitter is enough. We always deliver locally
 * too, so a single combined process needs no Redis.
 */
const CHANNEL = "atradio:live";

const local = new EventEmitter();
// Many concurrent SSE subscribers are expected; lift the default listener cap.
local.setMaxListeners(0);

let pub: Redis | null = null;
let sub: Redis | null = null;

if (env.REDIS_URL) {
  pub = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  pub.on("error", (err) => consola.warn("[live-bus pub]", err.message));

  sub = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  sub.on("error", (err) => consola.warn("[live-bus sub]", err.message));
  sub.on("ready", () => consola.success("[live-bus] redis pub/sub ready"));
  void sub.subscribe(CHANNEL).catch((err) =>
    consola.warn("[live-bus] subscribe failed", err),
  );
  sub.on("message", (_ch, payload) => {
    try {
      const { stationId, event } = JSON.parse(payload) as {
        stationId: string;
        event: LiveEvent;
      };
      local.emit(stationId, event);
    } catch {
      /* ignore malformed bus messages */
    }
  });
}

/** Publish a live event for a station to every subscriber (all processes). */
export function publishLive(stationId: string, event: LiveEvent): void {
  if (pub) {
    void pub
      .publish(CHANNEL, JSON.stringify({ stationId, event }))
      .catch((err) => consola.warn("[live-bus] publish failed", err.message));
  } else {
    // No Redis: deliver in-process only (works when server + consumer share a
    // process, e.g. the combined `index.ts` entrypoint or local dev).
    local.emit(stationId, event);
  }
}

/** Subscribe to a station's live events; returns an unsubscribe function. */
export function subscribeLive(
  stationId: string,
  handler: (event: LiveEvent) => void,
): () => void {
  local.on(stationId, handler);
  return () => local.off(stationId, handler);
}
