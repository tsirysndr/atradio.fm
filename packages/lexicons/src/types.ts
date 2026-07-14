export const NSID = {
  station: "fm.atradio.station",
  favorite: "fm.atradio.favorite",
  getFavorites: "fm.atradio.getFavorites",
  getStations: "fm.atradio.getStations",
} as const;

export type StationSource = "radio-browser" | "tunein" | "custom";

export interface StrongRef {
  uri: string;
  cid: string;
}

/** `fm.atradio.defs#stationInfo` — a self-contained station snapshot. */
export interface StationInfo {
  stationId: string;
  name: string;
  streamUrl: string;
  source: StationSource;
  description?: string;
  genre?: string;
  homepage?: string;
  logo?: string;
  country?: string;
  language?: string;
  bitrate?: number;
  codec?: string;
  tags?: string[];
}

/** `fm.atradio.favorite` record. */
export interface FavoriteRecord {
  $type?: typeof NSID.favorite;
  station: StationInfo;
  subject?: StrongRef;
  createdAt: string;
}

/** `fm.atradio.station` record. */
export interface StationRecord {
  $type?: typeof NSID.station;
  name: string;
  streamUrl: string;
  description?: string;
  genre?: string;
  homepage?: string;
  logo?: string;
  tags?: string[];
  createdAt: string;
}

/** `fm.atradio.defs#stationView` — a query output item. */
export interface StationView {
  uri: string;
  station: StationInfo;
  createdAt: string;
}

/** Output of `fm.atradio.getFavorites` / `getStations`. */
export interface StationListOutput {
  cursor?: string;
  items: StationView[];
}

/**
 * The app-level station shape (mirrors apps/web `Station`). Kept structurally
 * identical so the web app can pass its own `Station` to these mappers.
 */
export interface Station {
  id: string;
  name: string;
  description?: string;
  genre?: string;
  streamUrl: string;
  homepage?: string;
  favicon?: string;
  country?: string;
  language?: string;
  bitrate?: number;
  codec?: string;
  tags?: string[];
  source: StationSource;
}

/** A user-entered station draft (mirrors apps/web `CustomStationInput`). */
export interface StationDraft {
  name: string;
  streamUrl: string;
  description?: string;
  genre?: string;
  homepage?: string;
  logoUrl?: string;
}
