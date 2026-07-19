import type {
  CommentListOutput,
  ListenerCount,
  ListenerCountsOutput,
  NotificationListOutput,
  PlayListOutput,
  PlayView,
  StationListOutput,
  StationView,
} from "@atradio/lexicons";

/** Newest / trending stations output (`fm.atradio.getRecentStations`). */
interface StationItemsOutput {
  items: StationView[];
}

/** A most-favorited station with its count (`fm.atradio.getPopularStations`). */
export interface PopularItem {
  station: StationView["station"];
  count: number;
}
interface PopularStationsOutput {
  items: PopularItem[];
}

/**
 * The read side of the SDK: a thin `fetch`-based client over the public
 * atradio.fm AppView XRPC (`fm.atradio.*`). Everything here is unauthenticated
 * JSON-over-HTTP, so `AppView` is usable standalone.
 */
export class AppView {
  readonly #base: string;
  readonly #fetch: typeof fetch;

  constructor(
    base = "https://api.atradio.fm",
    fetchImpl: typeof fetch = fetch,
  ) {
    this.#base = base.replace(/\/+$/, "");
    this.#fetch = fetchImpl;
  }

  async #query<T>(
    nsid: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${this.#base}/xrpc/${nsid}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    const res = await this.#fetch(url.toString());
    const body = await res.text();
    if (!res.ok) throw new Error(`${nsid} -> ${res.status}: ${body}`);
    return JSON.parse(body) as T;
  }

  /** Newest stations platform-wide. */
  async recentStations(limit = 50): Promise<StationView[]> {
    const out = await this.#query<StationItemsOutput>(
      "fm.atradio.getRecentStations",
      { limit },
    );
    return out.items ?? [];
  }

  /** Most-favorited stations platform-wide. */
  async popularStations(limit = 50): Promise<PopularItem[]> {
    const out = await this.#query<PopularStationsOutput>(
      "fm.atradio.getPopularStations",
      { limit },
    );
    return out.items ?? [];
  }

  /** Platform-wide "who's listening" feed. */
  async globalRecentlyPlayed(limit = 50): Promise<PlayView[]> {
    const out = await this.#query<PlayListOutput>(
      "fm.atradio.getGlobalRecentlyPlayed",
      { limit },
    );
    return out.items ?? [];
  }

  /** An actor's own recently played stations (one per station). */
  async recentlyPlayed(actor: string, limit = 50): Promise<PlayView[]> {
    const out = await this.#query<PlayListOutput>(
      "fm.atradio.getRecentlyPlayed",
      { actor, limit },
    );
    return out.items ?? [];
  }

  /** An actor's favorited stations. */
  favorites(actor: string, limit = 50): Promise<StationListOutput> {
    return this.#query<StationListOutput>("fm.atradio.getFavorites", {
      actor,
      limit,
    });
  }

  /** An actor's own created (custom) stations. */
  stations(actor: string, limit = 50): Promise<StationListOutput> {
    return this.#query<StationListOutput>("fm.atradio.getStations", {
      actor,
      limit,
    });
  }

  /** Comments on a station, newest first. */
  comments(stationId: string, limit = 50): Promise<CommentListOutput> {
    return this.#query<CommentListOutput>("fm.atradio.getComments", {
      station: stationId,
      limit,
    });
  }

  /** Unique-listener counts for up to 100 station ids. */
  async listenerCounts(stationIds: string[]): Promise<ListenerCount[]> {
    if (stationIds.length === 0) return [];
    const out = await this.#query<ListenerCountsOutput>(
      "fm.atradio.getListenerCounts",
      { stations: stationIds.join(",") },
    );
    return out.counts ?? [];
  }

  /** An actor's notifications (mentions + comments on their stations). */
  notifications(actor: string, limit = 50): Promise<NotificationListOutput> {
    return this.#query<NotificationListOutput>("fm.atradio.getNotifications", {
      actor,
      limit,
    });
  }
}
