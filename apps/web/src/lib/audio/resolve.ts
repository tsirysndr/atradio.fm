import type { Station } from "@/lib/types";
import { APPVIEW_URL } from "@/lib/appview";

export interface ResolvedStream {
  url: string;
  /** True when the URL is an HLS manifest and needs hls.js on non-Safari. */
  isHls: boolean;
}

const isHlsUrl = (url: string) => /\.m3u8(\?|$)/i.test(url);

/**
 * Route a stream through our CORS-enabled `/api/stream` proxy.
 *
 * Every absolute `http(s)` stream is proxied. This is what keeps the Rockbox
 * DSP/EQ in the signal path: the decoder worker fetches the stream itself, and
 * cross-origin radio hosts almost never send `Access-Control-Allow-Origin`, so a
 * direct fetch is CORS-blocked — the engine then errors and playback silently
 * falls back to a bare `<audio>` element that bypasses the whole DSP chain
 * (no EQ, no bass, nothing). Proxying makes the fetch same-origin/CORS-OK so the
 * engine can always decode, and it also unwraps `.pls`/`.m3u` playlists.
 *
 * Not proxied:
 * - HLS `.m3u8` — segment URIs must resolve against the manifest's own origin
 *   (callers also branch on `isHls` first).
 * - relative / same-origin URLs (e.g. the TuneIn `/api/tunein/…` probe) — they
 *   are already CORS-safe and return a finite body, not a live stream.
 */
export function proxiedStreamUrl(url: string): string {
  if (isHlsUrl(url)) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  return `${APPVIEW_URL}/api/stream?url=${encodeURIComponent(url)}`;
}

/**
 * Pull the first usable stream URL out of a playlist body (.pls / .m3u / OPML
 * text response). Returns null when nothing playable is found.
 */
function firstUrlFromPlaylist(body: string): string | null {
  const text = body.trim();

  // .pls -> `File1=http://...`
  const pls = text.match(/^\s*File\d+\s*=\s*(\S+)/im);
  if (pls) return pls[1].trim();

  // .m3u / plain text -> first non-comment line that looks like a URL.
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^https?:\/\//i.test(t)) return t;
  }
  return null;
}

/**
 * Turn a station's `streamUrl` into something an <audio> element (or hls.js)
 * can actually play.
 *
 * - radio-browser `url_resolved` values are usually already direct streams.
 * - TuneIn stations point at a proxied Tune.ashx that returns a playlist body,
 *   which we unwrap here (the response is a small, finite text list).
 * - Plain `.pls` / `.m3u` playlists are unwrapped server-side by the stream
 *   proxy instead, so we must NOT fetch them here: `/api/stream` now returns the
 *   live audio for a playlist URL, and `res.text()` on an endless stream would
 *   hang. `proxiedStreamUrl` routes those through the proxy for us.
 *
 * Network failures fall back to the original URL — the <audio> element gets a
 * chance and surfaces its own error if that fails too.
 */
export async function resolveStream(
  station: Station,
  signal?: AbortSignal,
): Promise<ResolvedStream> {
  const url = station.streamUrl;

  // Only TuneIn's Tune.ashx is unwrapped client-side (finite OPML/text body).
  const looksLikePlaylist =
    station.source === "tunein" || /Tune\.ashx/i.test(url);

  if (looksLikePlaylist && !isHlsUrl(url)) {
    try {
      // Same-origin TuneIn proxy body — safe to read in full.
      const res = await fetch(proxiedStreamUrl(url), { signal });
      if (res.ok) {
        const body = await res.text();
        const resolved = firstUrlFromPlaylist(body);
        if (resolved) return { url: resolved, isHls: isHlsUrl(resolved) };
      }
    } catch {
      // fall through to the raw URL
    }
  }

  return { url, isHls: isHlsUrl(url) };
}
