/**
 * The audio stream reverse-proxy (`/api/stream?url=`).
 *
 * Streams an upstream radio stream through to the client so the Rockbox wasm
 * decoder can fetch it cross-origin (most hosts send no CORS). The upstream is
 * driven by the raw-socket client in `upstream.ts`; its live socket is wrapped
 * as the `Response` body so each chunk flows straight through, unbuffered.
 */

import { UPSTREAM_USER_AGENT } from "./config.ts";
import { firstStreamUrl, isUnwrappable } from "./playlist.ts";
import { open, streamBody } from "./upstream.ts";

/** Upstream headers worth forwarding, incl. the ICY metadata the decoder reads. */
const FORWARD_HEADERS = [
  "content-type",
  "icy-metaint",
  "icy-name",
  "icy-genre",
  "icy-br",
  "icy-description",
  "icy-url",
];

const CORS_EXPOSE =
  "content-type, icy-metaint, icy-name, icy-genre, icy-br, icy-description, icy-url";

export async function handle(req: Request): Promise<Response> {
  const url = queryUrl(req);
  if (url === null) return badRequest();

  const target = await resolveTarget(rewriteLegacyTunein(url));

  let up;
  try {
    up = await open(target, upstreamHeaders(req));
  } catch {
    console.warn(`stream: upstream open failed: ${target}`);
    return badGateway();
  }
  console.info(`stream: ${up.status} ${target}`);

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = up.headers.get(name);
    if (value !== undefined) headers.set(name, value);
  }
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-expose-headers", CORS_EXPOSE);
  headers.set("cache-control", "no-store");

  // No body (e.g. a HEAD-like/empty response) — nothing to stream.
  if (up.fin) return new Response(null, { status: up.status, headers });
  return new Response(streamBody(up), { status: up.status, headers });
}

// ---- helpers ---------------------------------------------------------------

function queryUrl(req: Request): string | null {
  const url = new URL(req.url).searchParams.get("url");
  if (url === null) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

function upstreamHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { "user-agent": UPSTREAM_USER_AGENT };
  forward(headers, req, "icy-metadata");
  forward(headers, req, "range");
  return headers;
}

function forward(headers: Record<string, string>, req: Request, name: string): void {
  const value = req.headers.get(name);
  if (value !== null) headers[name] = value;
}

/**
 * Re-point a legacy `<host>/api/tunein/…` URL (baked into old favorites, back
 * when the proxy lived on the AppView) straight at the real TuneIn origin —
 * self-heals stale links without a self-request hop.
 */
function rewriteLegacyTunein(url: string): string {
  return url.replace(/^https?:\/\/[^/]+\/api\/tunein/i, "https://opml.radiotime.com");
}

/**
 * `.pls`/`.m3u` unwrap to the real stream (finite body → `fetch`). `.m3u8` is
 * never unwrapped (the client plays HLS directly).
 */
async function resolveTarget(url: string): Promise<string> {
  if (!isUnwrappable(url)) return url;
  const body = await fetchText(url);
  if (body === null) return url;
  return firstStreamUrl(body) ?? url;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": UPSTREAM_USER_AGENT },
    });
    return await res.text();
  } catch {
    return null;
  }
}

function badRequest(): Response {
  return json(400, '{"error":"InvalidRequest","message":"url must be http(s)"}');
}

function badGateway(): Response {
  return json(502, '{"error":"BadGateway"}');
}

function json(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}
