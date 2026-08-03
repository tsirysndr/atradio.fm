/**
 * Buffered proxy routes (finite bodies): TuneIn, artwork, ICY "now playing".
 * These upstreams are well-behaved HTTP hosts, so `fetch` is enough — only the
 * infinite radio streams need the raw-socket client.
 */

import * as cache from "./cache.ts";
import { UPSTREAM_USER_AGENT } from "./config.ts";
import { readTitle } from "./icy.ts";
import { firstStreamUrl, isUnwrappable } from "./playlist.ts";

const UPSTREAM_TIMEOUT_MS = 8000;

/** Cache TTLs (seconds): TuneIn results are stable; ICY changes per song. */
const TUNEIN_TTL = 300;
const ICY_TTL = 20;

/** Reverse-proxy `/api/tunein/*` to opml.radiotime.com (TuneIn sends no CORS). */
export async function tunein(req: Request, rest: string[]): Promise<Response> {
  const path = "/" + rest.join("/");
  const query = new URL(req.url).search; // includes leading "?" or ""
  const key = `tunein:${path}${query}`;

  const cached = cache.get(key);
  if (cached !== null) {
    // Cached value is `content-type <> "\n" <> body`.
    const nl = cached.indexOf("\n");
    return nl === -1
      ? xCache(relayText(200, null, cached), "HIT")
      : xCache(relayText(200, cached.slice(0, nl), cached.slice(nl + 1)), "HIT");
  }

  const target = `https://opml.radiotime.com${path}${query}`;
  const accept = req.headers.get("accept") ?? "application/json";
  try {
    const res = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { accept },
    });
    const ct = res.headers.get("content-type") ?? "application/json";
    const body = await res.text();
    if (isOk(res.status)) cache.set(key, `${ct}\n${body}`, TUNEIN_TTL);
    return xCache(relayText(res.status, ct, body), "MISS");
  } catch {
    console.warn(`tunein: upstream failed: ${target}`);
    return jsonResponse(502, '{"error":"BadGateway"}');
  }
}

/**
 * Reverse-proxy a station logo so the https app can show `http://` favicons
 * without mixed-content blocking. Only actual image responses are relayed.
 */
export async function image(req: Request): Promise<Response> {
  const url = queryUrl(req);
  if (url === null) return badRequest();

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { "user-agent": UPSTREAM_USER_AGENT, accept: "image/*" },
    });
    const ct = res.headers.get("content-type") ?? "";
    if (isOk(res.status) && ct.startsWith("image/")) {
      return new Response(await res.arrayBuffer(), {
        status: 200,
        headers: { "content-type": ct, "cache-control": "public, max-age=86400" },
      });
    }
    return empty(415);
  } catch {
    console.warn(`image: upstream failed: ${url}`);
    return empty(502);
  }
}

/**
 * `/api/icy?url=<stream>` -> `{ "title": ... }`. Best-effort — a stream with no
 * ICY metadata (or a transient read failure) simply reports `null`.
 */
export async function icy(req: Request): Promise<Response> {
  const url = queryUrl(req);
  if (url === null) return jsonResponse(200, '{"title":null}');

  const key = `icy:${url}`;
  const cached = cache.get(key);
  if (cached !== null) return xCache(jsonResponse(200, cached), "HIT");

  const title = await readTitle(await resolveStream(url));
  const body = JSON.stringify({ title: title ?? null });
  cache.set(key, body, ICY_TTL);
  return xCache(jsonResponse(200, body), "MISS");
}

/** `.pls`/`.m3u` playlists point at the real stream — unwrap before reading ICY. */
async function resolveStream(url: string): Promise<string> {
  if (!isUnwrappable(url)) return url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return firstStreamUrl(await res.text()) ?? url;
  } catch {
    return url;
  }
}

// ---- helpers ---------------------------------------------------------------

function queryUrl(req: Request): string | null {
  const url = new URL(req.url).searchParams.get("url");
  if (url === null) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function relayText(status: number, contentType: string | null, body: string): Response {
  const headers = new Headers();
  if (contentType !== null) headers.set("content-type", contentType);
  return new Response(body, { status, headers });
}

function jsonResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

function xCache(res: Response, state: string): Response {
  res.headers.set("x-cache", state);
  return res;
}

function badRequest(): Response {
  return jsonResponse(400, '{"error":"InvalidRequest","message":"url must be http(s)"}');
}

function empty(status: number): Response {
  return new Response(null, { status });
}
