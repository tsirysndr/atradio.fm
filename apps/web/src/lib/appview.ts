import type { StationListOutput, StationView } from "@atradio/lexicons";

/**
 * Client for the atradio.fm AppView XRPC API (apps/api). Reads the indexed,
 * aggregated data (public profiles by handle/did, discovery feeds). In dev,
 * set VITE_APPVIEW_URL to your locally-running API (e.g. http://127.0.0.1:8080).
 */
const BASE = (import.meta.env.VITE_APPVIEW_URL ?? "https://api.atradio.fm").replace(
  /\/$/,
  "",
);

export interface ListQuery {
  limit?: number;
  cursor?: string;
  /** free-text filter (name/genre) */
  q?: string;
  /** radio-browser | tunein | custom */
  source?: string;
  /** recent | name | -name */
  sort?: string;
}

async function listQuery(
  nsid: string,
  actor: string,
  opts: ListQuery = {},
): Promise<StationListOutput> {
  const params = new URLSearchParams({ actor });
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.q) params.set("q", opts.q);
  if (opts.source) params.set("source", opts.source);
  if (opts.sort) params.set("sort", opts.sort);
  const res = await fetch(`${BASE}/xrpc/${nsid}?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${nsid}: ${res.status}`);
  return (await res.json()) as StationListOutput;
}

/** A user's favorited stations (from the index). */
export const getFavorites = (actor: string, opts?: ListQuery) =>
  listQuery("fm.atradio.getFavorites", actor, opts);

/** A user's entered stations (from the index). */
export const getStations = (actor: string, opts?: ListQuery) =>
  listQuery("fm.atradio.getStations", actor, opts);

async function feed(nsid: string, limit = 30): Promise<StationView[]> {
  const res = await fetch(`${BASE}/xrpc/${nsid}?limit=${limit}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${nsid}: ${res.status}`);
  const data = (await res.json()) as { items: StationView[] };
  return data.items;
}

export const getRecentStations = (limit?: number) =>
  feed("fm.atradio.getRecentStations", limit);
export const getPopularStations = (limit?: number) =>
  feed("fm.atradio.getPopularStations", limit);
