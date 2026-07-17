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
  /**
   * This AppView's own DID — the `aud` (audience) that clients bind their
   * atproto service-auth JWTs to when connecting to the Connect hub. Clients
   * must request a token for exactly this DID. Served (as did:web) at
   * `/.well-known/did.json` so the identifier is resolvable.
   */
  CONNECT_SERVICE_DID: process.env.CONNECT_SERVICE_DID ?? "did:web:api.atradio.fm",
  /** All Jetstream hosts we connect to simultaneously for redundancy. */
  JETSTREAM_HOSTS: (process.env.JETSTREAM_HOSTS
    ? process.env.JETSTREAM_HOSTS.split(",")
    : DEFAULT_JETSTREAMS
  ).map((h) => h.trim()),
};

if (!env.DATABASE_URL) {
  consola.warn("[env] DATABASE_URL is not set — the API cannot reach Postgres.");
}
