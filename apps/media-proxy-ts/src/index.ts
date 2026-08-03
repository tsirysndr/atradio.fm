/**
 * atradio media proxy — a small, stateless reverse-proxy for radio streams,
 * TuneIn, station artwork, and ICY "now playing" metadata.
 *
 * The long-lived, bandwidth-heavy streaming workload scales and fails
 * independently of discovery + Connect. Every route is public and read-only, so
 * CORS is a blanket `origin: *`.
 */

import { port, rateLimit, rateWindow } from "./config.ts";
import * as ratelimit from "./ratelimit.ts";
import * as simple from "./simple.ts";
import * as stream from "./stream.ts";

/** Headers to expose so the wasm decoder can read ICY metadata cross-origin. */
const CORS_EXPOSE_HEADERS =
  "content-type, icy-metaint, icy-name, icy-genre, icy-br, icy-description, icy-url";

/** Landing page served at `GET /`. */
const BANNER = `
       )))
   ((  •  ))     a t r a d i o
       )))       m e d i a   p r o x y
  ───────────────────────────────────────────────

  Stateless reverse-proxy for radio streams, TuneIn,
  artwork, and ICY "now playing" metadata.

    GET /api/stream?url=   pipe an audio stream (CORS-safe)
    GET /api/tunein/*      TuneIn OPML proxy
    GET /api/image?url=    station artwork proxy
    GET /api/icy?url=      ICY now-playing title
    GET /healthz           liveness

  TypeScript · Bun · https://atradio.fm
`;

// Owned by the process so it outlives request handlers.
ratelimit.init();

const server = Bun.serve({
  port: port(),
  hostname: "0.0.0.0",
  // Streams are connection-close-delimited and effectively infinite; disable
  // the idle timeout so a listening client is never cut off mid-song.
  idleTimeout: 0,
  async fetch(req, srv) {
    const res = await route(req, srv);
    const { pathname } = new URL(req.url);
    console.info(`${req.method} ${pathname} -> ${res.status}`);
    return res;
  },
});

console.info(`media proxy listening on :${server.port}`);

async function route(req: Request, srv: Bun.Server<undefined>): Promise<Response> {
  // CORS preflight (the decoder's `Icy-MetaData`/`Range` headers are non-simple,
  // so the browser sends an OPTIONS first).
  if (req.method === "OPTIONS") return preflight(req);

  const { pathname } = new URL(req.url);
  const segments = pathname.split("/").filter((s) => s !== "");

  // Rate-limit the `/api/*` routes per client IP; health + root are exempt.
  if (segments[0] === "api") {
    const decision = ratelimit.check(clientIp(req, srv), rateLimit(), rateWindow());
    if (decision.kind === "limited") return cors(tooMany(decision.retryAfter));
  }

  if (segments.length === 0) return cors(text(200, BANNER));
  if (segments.length === 1 && segments[0] === "healthz") return cors(text(200, "ok"));

  if (segments[0] === "api") {
    // The stream route sets its own headers (they flush immediately), so it
    // applies CORS itself rather than through `cors()` here.
    if (segments[1] === "stream" && segments.length === 2) return stream.handle(req);
    if (segments[1] === "icy" && segments.length === 2) return cors(await simple.icy(req));
    if (segments[1] === "image" && segments.length === 2) return cors(await simple.image(req));
    if (segments[1] === "tunein") return cors(await simple.tunein(req, segments.slice(2)));
  }

  return cors(text(404, "not found"));
}

function cors(res: Response): Response {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-expose-headers", CORS_EXPOSE_HEADERS);
  return res;
}

/** Real client IP, trusting the reverse proxy's forwarding headers first. */
function clientIp(req: Request, srv: Bun.Server<undefined>): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff !== null) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp !== null) return realIp;
  return srv.requestIP(req)?.address ?? "unknown";
}

function tooMany(retryAfter: number): Response {
  return new Response('{"error":"TooManyRequests"}', {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
  });
}

/**
 * Answer a CORS preflight, reflecting whatever headers the browser asked to send
 * (e.g. `icy-metadata`, `range`) so the real request is allowed.
 */
function preflight(req: Request): Response {
  const allowHeaders =
    req.headers.get("access-control-request-headers") ?? "icy-metadata, range, content-type";
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": allowHeaders,
      "access-control-max-age": "86400",
    },
  });
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
