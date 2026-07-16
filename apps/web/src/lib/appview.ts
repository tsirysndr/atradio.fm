import type {
  CommentListOutput,
  ListenerCount,
  LiveEvent,
  NotificationListOutput,
  PlayView,
  StationListOutput,
  StationView,
} from "@atradio/lexicons";

/**
 * Client for the atradio.fm AppView XRPC API (apps/api). Reads the indexed,
 * aggregated data (public profiles by handle/did, discovery feeds). In dev,
 * set VITE_APPVIEW_URL to your locally-running API (e.g. http://127.0.0.1:8080).
 */
const BASE = (import.meta.env.VITE_APPVIEW_URL ?? "https://api.atradio.fm").replace(
  /\/$/,
  "",
);

/** Base origin of the AppView API (also hosts the media proxies under /api). */
export const APPVIEW_URL = BASE;

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

interface PlayFeed {
  cursor?: string;
  items: PlayView[];
}

/** A user's recently played stations (distinct, newest first). */
export async function getRecentlyPlayed(
  actor: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<PlayFeed> {
  const params = new URLSearchParams({ actor });
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const res = await fetch(
    `${BASE}/xrpc/fm.atradio.getRecentlyPlayed?${params}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`getRecentlyPlayed: ${res.status}`);
  return (await res.json()) as PlayFeed;
}

/** Platform-wide recent play events (with the actor who played each). */
export async function getGlobalRecentlyPlayed(
  opts: { limit?: number; cursor?: string } = {},
): Promise<PlayFeed> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const res = await fetch(
    `${BASE}/xrpc/fm.atradio.getGlobalRecentlyPlayed?${params}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`getGlobalRecentlyPlayed: ${res.status}`);
  return (await res.json()) as PlayFeed;
}

/** Unique-listener counts for the given station ids (missing ids → absent). */
export async function getListenerCounts(
  stationIds: string[],
): Promise<ListenerCount[]> {
  if (stationIds.length === 0) return [];
  const params = new URLSearchParams({ stations: stationIds.join(",") });
  const res = await fetch(
    `${BASE}/xrpc/fm.atradio.getListenerCounts?${params}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`getListenerCounts: ${res.status}`);
  const data = (await res.json()) as { counts: ListenerCount[] };
  return data.counts;
}

/** Comments on a station (newest first). */
export async function getComments(
  stationId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<CommentListOutput> {
  const params = new URLSearchParams({ station: stationId });
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const res = await fetch(`${BASE}/xrpc/fm.atradio.getComments?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`getComments: ${res.status}`);
  return (await res.json()) as CommentListOutput;
}

/** An actor's notifications + current unread count. */
export async function getNotifications(
  actor: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<NotificationListOutput> {
  const params = new URLSearchParams({ actor });
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const res = await fetch(
    `${BASE}/xrpc/fm.atradio.getNotifications?${params}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`getNotifications: ${res.status}`);
  return (await res.json()) as NotificationListOutput;
}

/** Advance the actor's last-seen marker (resets the bell badge). */
export async function updateSeen(
  actor: string,
  seenAt?: string,
): Promise<{ unreadCount: number }> {
  const res = await fetch(`${BASE}/xrpc/fm.atradio.updateSeen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor, seenAt }),
  });
  if (!res.ok) throw new Error(`updateSeen: ${res.status}`);
  return (await res.json()) as { unreadCount: number };
}

/**
 * Subscribe to a station's live comment + reaction stream (SSE). Returns a
 * cleanup function that closes the connection.
 */
export function subscribeLive(
  stationId: string,
  onEvent: (event: LiveEvent) => void,
): () => void {
  const url = `${BASE}/live/${encodeURIComponent(stationId)}`;
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as LiveEvent);
    } catch {
      /* ignore malformed frames */
    }
  };
  // EventSource auto-reconnects on error; nothing to do but keep it open.
  return () => es.close();
}
