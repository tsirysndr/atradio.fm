import type { Station } from "@/lib/types";

/**
 * TuneIn's public OPML endpoint (opml.radiotime.com) powers its search. It is
 * NOT officially documented and does not send CORS headers, so direct browser
 * requests are blocked. Every request therefore goes through a proxy:
 *   - dev: Vite's `/api/tunein` proxy (see vite.config.ts) rewrites to the real
 *     opml.radiotime.com host, same-origin so no CORS.
 *   - prod: set VITE_TUNEIN_PROXY to an equivalent server-side proxy path/URL.
 * The unified search still treats a TuneIn failure as "no TuneIn results"
 * rather than failing the whole search.
 */
const BASE = import.meta.env.VITE_TUNEIN_PROXY ?? "/api/tunein";

/** Route any absolute opml.radiotime.com URL back through our proxy. */
export function proxyTuneInUrl(url: string): string {
  return url.replace(/^https?:\/\/opml\.radiotime\.com/i, BASE);
}

interface TuneInItem {
  element?: string;
  type?: string; // "audio" for playable stations
  text?: string;
  URL?: string;
  guide_id?: string;
  subtext?: string;
  genre_id?: string;
  image?: string;
  bitrate?: string;
  formats?: string;
  item?: string;
}

function toStation(i: TuneInItem): Station {
  return {
    id: `tunein:${i.guide_id ?? i.URL ?? i.text}`,
    name: (i.text ?? "Unknown station").trim(),
    description: i.subtext,
    genre: i.genre_id?.replace(/^g/, "") || undefined,
    // Tune.ashx URL — resolves to an actual stream/playlist at play time.
    // Proxied so the resolve fetch is same-origin (no CORS).
    streamUrl: i.URL ? proxyTuneInUrl(i.URL) : "",
    favicon: i.image,
    bitrate: i.bitrate ? Number(i.bitrate) : undefined,
    tags: i.formats
      ? i.formats.split(",").map((f) => f.trim()).filter(Boolean)
      : undefined,
    source: "tunein",
  };
}

export async function searchTuneIn(
  query: string,
  signal?: AbortSignal,
): Promise<Station[]> {
  const params = new URLSearchParams({
    query,
    render: "json",
    formats: "mp3,aac",
  });
  const res = await fetch(`${BASE}/Search.ashx?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`tunein: ${res.status}`);
  const data = (await res.json()) as { body?: TuneInItem[] };
  return (data.body ?? [])
    .filter((i) => i.type === "audio" && i.URL)
    .map(toStation);
}
