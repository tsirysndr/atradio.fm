import type { Station } from "@/lib/types";
import { APPVIEW_URL } from "@/lib/appview";

export interface ResolvedStream {
  url: string;
  /** True when the URL is an HLS manifest and needs hls.js on non-Safari. */
  isHls: boolean;
}

const isHlsUrl = (url: string) => /\.m3u8(\?|$)/i.test(url);

/**
 * Route an `http://` stream through our https API proxy so it isn't blocked as
 * mixed content when the app itself is served over https. `https://` URLs and
 * (dev) http pages are returned unchanged, so playback stays direct wherever it
 * safely can. HLS manifests are never proxied — their segment URIs would then
 * resolve against the proxy origin — so callers should skip HLS.
 */
export function proxiedStreamUrl(url: string): string {
  const isHttp = /^http:\/\//i.test(url);
  const pageHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  if (!isHttp || !pageHttps) return url;
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
 * - TuneIn stations point at a proxied Tune.ashx that returns a playlist body.
 * - Some direct URLs are `.pls` / `.m3u` playlists that must be unwrapped.
 *
 * Network failures fall back to the original URL — the <audio> element gets a
 * chance and surfaces its own error if that fails too.
 */
export async function resolveStream(
  station: Station,
  signal?: AbortSignal,
): Promise<ResolvedStream> {
  const url = station.streamUrl;

  const looksLikePlaylist =
    station.source === "tunein" ||
    /\.pls(\?|$)/i.test(url) ||
    /\.m3u(\?|$)/i.test(url) ||
    /Tune\.ashx/i.test(url);

  if (looksLikePlaylist && !isHlsUrl(url)) {
    try {
      // Fetch the playlist over the proxy too — an http playlist body can't be
      // read directly from an https page.
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
