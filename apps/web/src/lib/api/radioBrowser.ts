import type { Station } from "@/lib/types";

/**
 * radio-browser.info runs a rotating pool of mirror servers, and individual
 * mirrors get decommissioned without notice (e.g. de2/nl1/at1 all stopped
 * answering while de1 stayed up). Pinning to one random hardcoded mirror per
 * session therefore breaks the whole app for every session that happens to draw
 * a dead host. Instead we discover the *live* servers at runtime from the
 * official directory and fail over across them on every request.
 *
 * `all.api.radio-browser.info` is a round-robin DNS entry that always resolves
 * to a healthy node, so it's both our bootstrap for the server list and our
 * last-resort fallback. All mirrors send permissive CORS headers, so these
 * calls work straight from the browser.
 */
const DIRECTORY = "https://all.api.radio-browser.info";

interface RadioBrowserServer {
  name: string;
}

/** Randomize order so load spreads across the live mirrors. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Resolve the base URLs to try, live servers first (shuffled) with the
 * round-robin directory as a guaranteed fallback. Cached for the session; a
 * failed discovery still yields a usable list.
 */
let basesPromise: Promise<string[]> | undefined;
function getBases(): Promise<string[]> {
  basesPromise ??= (async () => {
    try {
      const res = await fetch(`${DIRECTORY}/json/servers`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`servers: ${res.status}`);
      const servers = (await res.json()) as RadioBrowserServer[];
      const names = [...new Set(servers.map((s) => s.name).filter(Boolean))];
      const live = shuffle(names.map((n) => `https://${n}`));
      // Directory last: it's the reliable fallback if every named host fails.
      return [...live, DIRECTORY];
    } catch {
      // Discovery failed (offline, blocked, all mirrors down) — the directory
      // round-robin is still our best shot.
      return [DIRECTORY];
    }
  })();
  return basesPromise;
}

/**
 * Fetch a radio-browser path, trying each live base until one responds. A
 * network error or non-OK status falls through to the next base; an aborted
 * request bails immediately. Throws only when every base has been exhausted.
 */
async function rbFetch(path: string, signal?: AbortSignal): Promise<Response> {
  const bases = await getBases();
  let lastError: unknown;
  for (const base of bases) {
    if (signal?.aborted) throw signal.reason ?? new Error("aborted");
    try {
      const res = await fetch(`${base}${path}`, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (res.ok) return res;
      lastError = new Error(`radio-browser: ${res.status}`);
    } catch (err) {
      // A caller-initiated abort must propagate, not trigger failover.
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new Error("radio-browser: all mirrors unreachable");
}

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
  const res = await rbFetch(`/json/stations/search?${params}`, signal);
  const data = (await res.json()) as RadioBrowserStation[];
  return data
    .filter((s) => s.url_resolved || s.url)
    .map(toStation);
}

export interface StationPageParams {
  /** Tag/genre to browse, e.g. "synthwave" or "hip hop". */
  tag: string;
  /** How many stations to skip (for pagination). */
  offset: number;
  /** Page size. */
  limit: number;
  signal?: AbortSignal;
}

/**
 * Browse every station carrying a given tag, most-played first. Unlike the
 * name search this is paginated via `offset`/`limit`, which is what lets the
 * category browse page infinite-scroll through the entire genre.
 */
export async function browseRadioBrowserByTag({
  tag,
  offset,
  limit,
  signal,
}: StationPageParams): Promise<Station[]> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
  });
  const res = await rbFetch(
    `/json/stations/bytag/${encodeURIComponent(tag)}?${params}`,
    signal,
  );
  const data = (await res.json()) as RadioBrowserStation[];
  return data.filter((s) => s.url_resolved || s.url).map(toStation);
}

/**
 * radio-browser asks clients to register a "click" when a station is actually
 * played so its popularity ranking stays useful. Fire-and-forget; failures are
 * irrelevant to the listener.
 */
export function registerRadioBrowserClick(stationId: string): void {
  const uuid = stationId.replace(/^rb:/, "");
  rbFetch(`/json/url/${uuid}`).catch(() => {});
}
