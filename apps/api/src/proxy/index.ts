import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { consola } from "consola";
import { cacheGet, cacheSet } from "../cache";

export const proxyRouter = Router();

// Cache TTLs (seconds): TuneIn search results are stable; ICY "now playing"
// changes per song, so keep it short but enough to absorb concurrent listeners.
const TUNEIN_TTL = 300;
const ICY_TTL = 20;

/* ----------------------------- TuneIn proxy ----------------------------- */

/** Reverse-proxy /api/tunein/* to opml.radiotime.com/* (TuneIn sends no CORS). */
proxyRouter.get(/^\/tunein\/.*/, async (req: Request, res: Response) => {
  const path = req.originalUrl.replace(/^\/api\/tunein/, "");
  const key = `tunein:${path}`;

  const cached = await cacheGet(key);
  if (cached) {
    const { ct, body } = JSON.parse(cached) as { ct?: string; body: string };
    res.setHeader("X-Cache", "HIT");
    if (ct) res.setHeader("Content-Type", ct);
    return res.send(body);
  }

  const target = `https://opml.radiotime.com${path}`;
  try {
    const upstream = await fetch(target, {
      headers: { Accept: req.headers.accept ?? "application/json" },
    });
    const type = upstream.headers.get("content-type") ?? undefined;
    const body = await upstream.text();
    if (upstream.ok) await cacheSet(key, JSON.stringify({ ct: type, body }), TUNEIN_TTL);
    res.status(upstream.status).setHeader("X-Cache", "MISS");
    if (type) res.setHeader("Content-Type", type);
    res.send(body);
  } catch (err) {
    consola.error("[proxy] tunein error", err);
    res.status(502).json({ error: "BadGateway" });
  }
});

/* ------------------------------ Stream proxy ---------------------------- */

/** Upstream response headers worth forwarding to the player, incl. the ICY
 *  metadata headers the decoder reads for "now playing". */
const STREAM_HEADERS = [
  "content-type",
  "icy-metaint",
  "icy-name",
  "icy-genre",
  "icy-br",
  "icy-description",
  "icy-url",
];

/**
 * GET /api/stream?url=<http(s) stream>
 *
 * Reverse-proxy an audio stream so the https app can play `http://` streams
 * without the browser blocking them as mixed content. Bytes are piped straight
 * through (never buffered), and the client's ICY intent is forwarded so
 * metadata interleaving still works when the decoder asks for it.
 */
proxyRouter.get("/stream", async (req: Request, res: Response) => {
  const target = String(req.query.url ?? "");
  if (!/^https?:\/\//i.test(target)) {
    res
      .status(400)
      .json({ error: "InvalidRequest", message: "url must be http(s)" });
    return;
  }

  const controller = new AbortController();
  // Drop the upstream connection as soon as the client goes away.
  res.on("close", () => controller.abort());

  try {
    const upstream = await fetch(target, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "atradio.fm/1.0",
        // Only interleave metadata if the decoder actually requested it.
        ...(req.headers["icy-metadata"]
          ? { "Icy-MetaData": String(req.headers["icy-metadata"]) }
          : {}),
        ...(req.headers.range ? { Range: String(req.headers.range) } : {}),
      },
    });

    res.status(upstream.status);
    for (const h of STREAM_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    // Let cross-origin JS (the wasm decoder) read the ICY headers.
    res.setHeader("Access-Control-Expose-Headers", STREAM_HEADERS.join(", "));
    res.setHeader("Cache-Control", "no-store");

    if (!upstream.body) {
      res.end();
      return;
    }
    const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
    stream.on("error", () => {
      if (!res.destroyed) res.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    if (controller.signal.aborted) return; // client disconnected — expected
    consola.error("[proxy] stream error", err);
    if (!res.headersSent) res.status(502).json({ error: "BadGateway" });
    else res.destroy();
  }
});

/* ------------------------------- ICY proxy ------------------------------ */

async function resolvePlaylist(target: string): Promise<string> {
  if (!/\.(pls|m3u|m3u8)(\?|$)/i.test(target)) return target;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(target, { redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return target;
    const body = await res.text();
    const pls = body.match(/^\s*File\d+\s*=\s*(\S+)/im);
    if (pls) return pls[1].trim();
    for (const line of body.split(/\r?\n/)) {
      const s = line.trim();
      if (s && !s.startsWith("#") && /^https?:\/\//i.test(s)) return s;
    }
  } catch {
    /* fall through */
  } finally {
    clearTimeout(t);
  }
  return target;
}

async function readIcyTitle(rawTarget: string): Promise<string | null> {
  const target = await resolvePlaylist(rawTarget);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(target, {
      headers: { "Icy-MetaData": "1", "User-Agent": "atradio.fm/1.0" },
      signal: controller.signal,
      redirect: "follow",
    });
    const metaint = Number(resp.headers.get("icy-metaint"));
    if (!resp.body || !metaint || Number.isNaN(metaint)) {
      try {
        await resp.body?.cancel();
      } catch {
        /* ignore */
      }
      return null;
    }

    const reader = resp.body.getReader();
    const maxBytes = metaint * 2 + 4096;
    let bytesUntilMeta = metaint;
    let metaLength = -1;
    let metaCollected = 0;
    let metaBuffer = new Uint8Array(0);
    let total = 0;

    try {
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        total += value.length;
        let i = 0;
        while (i < value.length) {
          if (bytesUntilMeta > 0) {
            const skip = Math.min(bytesUntilMeta, value.length - i);
            i += skip;
            bytesUntilMeta -= skip;
          } else if (metaLength === -1) {
            metaLength = value[i] * 16;
            i += 1;
            if (metaLength === 0) {
              bytesUntilMeta = metaint;
              metaLength = -1;
            } else {
              metaBuffer = new Uint8Array(metaLength);
              metaCollected = 0;
            }
          } else {
            const take = Math.min(metaLength - metaCollected, value.length - i);
            metaBuffer.set(value.subarray(i, i + take), metaCollected);
            metaCollected += take;
            i += take;
            if (metaCollected >= metaLength) {
              const text = Buffer.from(metaBuffer).toString("utf8");
              const m = text.match(/StreamTitle='((?:[^']|'(?!;))*)'/);
              return m?.[1]?.trim() || null;
            }
          }
        }
      }
      return null;
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/icy?url=<stream> -> { title }. */
proxyRouter.get("/icy", async (req: Request, res: Response) => {
  const target = String(req.query.url ?? "");
  if (!/^https?:\/\//i.test(target)) {
    return res.json({ title: null });
  }
  const key = `icy:${target}`;
  const cached = await cacheGet(key);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(JSON.parse(cached));
  }
  try {
    const title = await readIcyTitle(target);
    await cacheSet(key, JSON.stringify({ title }), ICY_TTL);
    res.setHeader("X-Cache", "MISS");
    return res.json({ title });
  } catch (err) {
    consola.error("[proxy] icy error", err);
    return res.json({ title: null });
  }
});
