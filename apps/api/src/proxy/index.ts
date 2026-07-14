import { Router, type Request, type Response } from "express";
import { consola } from "consola";

export const proxyRouter = Router();

/* ----------------------------- TuneIn proxy ----------------------------- */

/** Reverse-proxy /api/tunein/* to opml.radiotime.com/* (TuneIn sends no CORS). */
proxyRouter.get(/^\/tunein\/.*/, async (req: Request, res: Response) => {
  const path = req.originalUrl.replace(/^\/api\/tunein/, "");
  const target = `https://opml.radiotime.com${path}`;
  try {
    const upstream = await fetch(target, {
      headers: { Accept: req.headers.accept ?? "application/json" },
    });
    res.status(upstream.status);
    const type = upstream.headers.get("content-type");
    if (type) res.setHeader("Content-Type", type);
    const body = await upstream.text();
    res.send(body);
  } catch (err) {
    consola.error("[proxy] tunein error", err);
    res.status(502).json({ error: "BadGateway" });
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
  try {
    const title = await readIcyTitle(target);
    return res.json({ title });
  } catch (err) {
    consola.error("[proxy] icy error", err);
    return res.json({ title: null });
  }
});
