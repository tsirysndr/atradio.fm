import "dotenv/config";
import { consola } from "consola";

const DEFAULT_JETSTREAMS = [
  "jetstream1.us-east.bsky.network",
  "jetstream2.us-east.bsky.network",
  "jetstream1.us-west.bsky.network",
  "jetstream2.us-west.bsky.network",
];

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  /** Optional Redis cache; caching is disabled when unset. */
  REDIS_URL: process.env.REDIS_URL ?? "",
  PORT: Number(process.env.PORT ?? 8080),
  /** All Jetstream hosts we connect to simultaneously for redundancy. */
  JETSTREAM_HOSTS: (process.env.JETSTREAM_HOSTS
    ? process.env.JETSTREAM_HOSTS.split(",")
    : DEFAULT_JETSTREAMS
  ).map((h) => h.trim()),
};

if (!env.DATABASE_URL) {
  consola.warn("[env] DATABASE_URL is not set — the API cannot reach Postgres.");
}
