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
   * This AppView's own DID (did:web) — served at `/.well-known/did.json` so the
   * identifier is resolvable. NOTE: this is the bare DID; the Connect audience
   * below adds a service fragment (atproto's OAuth scope parser requires the
   * `rpc:` audience to be a `did#serviceId` reference, not a bare DID).
   */
  CONNECT_SERVICE_DID: process.env.CONNECT_SERVICE_DID ?? "did:web:api.atradio.fm",
  /**
   * The `aud` (audience) that clients bind their atproto service-auth JWTs to
   * when connecting to the Connect hub — a DID **service reference** (bare DID +
   * `#fragment`). Clients request an `rpc:...?aud=<this>` OAuth scope and mint
   * the token for exactly this value; the hub verifies the JWT `aud` equals it.
   * Must match `CONNECT_SERVICE_AUD` in the web + CLI clients.
   */
  CONNECT_SERVICE_AUD:
    process.env.CONNECT_SERVICE_AUD ??
    `${process.env.CONNECT_SERVICE_DID ?? "did:web:api.atradio.fm"}#atradio_appview`,
  /** All Jetstream hosts we connect to simultaneously for redundancy. */
  JETSTREAM_HOSTS: (process.env.JETSTREAM_HOSTS
    ? process.env.JETSTREAM_HOSTS.split(",")
    : DEFAULT_JETSTREAMS
  ).map((h) => h.trim()),
};

if (!env.DATABASE_URL) {
  consola.warn("[env] DATABASE_URL is not set — the API cannot reach Postgres.");
}
