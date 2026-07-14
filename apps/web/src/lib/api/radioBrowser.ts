import type { Station } from "@/lib/types";

/**
 * radio-browser.info exposes a pool of mirror servers. We pick one at random
 * per session (as the project recommends) to spread load. All mirrors send
 * permissive CORS headers, so these calls work straight from the browser.
 */
const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

const BASE = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];

interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  language: string;
  codec: string;
  bitrate: number;
  votes: number;
  clickcount: number;
}

function toStation(s: RadioBrowserStation): Station {
  const tags = s.tags
    ? s.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  return {
    id: `rb:${s.stationuuid}`,
    name: s.name.trim(),
    streamUrl: s.url_resolved || s.url,
    homepage: s.homepage || undefined,
    favicon: s.favicon || undefined,
    genre: tags[0],
    tags,
    country: s.country || undefined,
    language: s.language || undefined,
    bitrate: s.bitrate || undefined,
    codec: s.codec || undefined,
    source: "radio-browser",
  };
}

export async function searchRadioBrowser(
  query: string,
  signal?: AbortSignal,
): Promise<Station[]> {
  const params = new URLSearchParams({
    name: query,
    limit: "60",
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
  });
  const res = await fetch(`${BASE}/json/stations/search?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`radio-browser: ${res.status}`);
  const data = (await res.json()) as RadioBrowserStation[];
  return data
    .filter((s) => s.url_resolved || s.url)
    .map(toStation);
}

/**
 * radio-browser asks clients to register a "click" when a station is actually
 * played so its popularity ranking stays useful. Fire-and-forget; failures are
 * irrelevant to the listener.
 */
export function registerRadioBrowserClick(stationId: string): void {
  const uuid = stationId.replace(/^rb:/, "");
  fetch(`${BASE}/json/url/${uuid}`).catch(() => {});
}
