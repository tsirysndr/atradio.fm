export const NSID = {
  station: "fm.atradio.station",
  favorite: "fm.atradio.favorite",
  audioSettings: "fm.atradio.audio.settings",
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
  /** Total number of records for the actor (not just this page). */
  total: number;
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

// ---- fm.atradio.audio.settings ----

export type CrossfeedModeValue = "off" | "meier" | "custom";
export type ChannelModeValue =
  | "stereo"
  | "mono"
  | "custom"
  | "mono-left"
  | "mono-right"
  | "karaoke"
  | "swap";

/** Singleton record rkey (one settings record per repo). */
export const AUDIO_SETTINGS_RKEY = "self";

/** `fm.atradio.audio.settings` record. `crossfeedDirect` is in tenths of dB. */
export interface AudioSettingsRecord {
  $type?: typeof NSID.audioSettings;
  eqEnabled?: boolean;
  eqGains?: number[];
  bass?: number;
  treble?: number;
  crossfeedMode?: CrossfeedModeValue;
  crossfeedDirect?: number;
  pbe?: number;
  pbePrecut?: number;
  surroundDelay?: number;
  surroundBalance?: number;
  compThreshold?: number;
  compRatio?: number;
  channelMode?: ChannelModeValue;
  stereoWidth?: number;
  updatedAt: string;
}

/**
 * The app-level audio settings shape (mirrors apps/web `AudioSettings`).
 * Unlike the record, `crossfeedDirect` is in plain dB here.
 */
export interface AudioSettingsData {
  eqEnabled: boolean;
  eqGains: number[];
  bass: number;
  treble: number;
  crossfeedMode: CrossfeedModeValue;
  crossfeedDirect: number;
  pbe: number;
  pbePrecut: number;
  surroundDelay: number;
  surroundBalance: number;
  compThreshold: number;
  compRatio: number;
  channelMode: ChannelModeValue;
  stereoWidth: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettingsData = {
  eqEnabled: false,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: 0,
  treble: 0,
  crossfeedMode: "off",
  crossfeedDirect: -1.5,
  pbe: 0,
  pbePrecut: 0,
  surroundDelay: 0,
  surroundBalance: 35,
  compThreshold: 0,
  compRatio: 2,
  channelMode: "stereo",
  stereoWidth: 100,
};
