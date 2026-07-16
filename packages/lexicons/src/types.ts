export const NSID = {
  station: "fm.atradio.station",
  favorite: "fm.atradio.favorite",
  comment: "fm.atradio.comment",
  reaction: "fm.atradio.reaction",
  audioSettings: "fm.atradio.audio.settings",
  actorStatus: "fm.atradio.actor.status",
  getFavorites: "fm.atradio.getFavorites",
  getStations: "fm.atradio.getStations",
  getRecentlyPlayed: "fm.atradio.getRecentlyPlayed",
  getGlobalRecentlyPlayed: "fm.atradio.getGlobalRecentlyPlayed",
  getListenerCounts: "fm.atradio.getListenerCounts",
  getComments: "fm.atradio.getComments",
  getNotifications: "fm.atradio.getNotifications",
  updateSeen: "fm.atradio.updateSeen",
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

/** `fm.atradio.defs#actorInfo` — a minimal public actor snapshot. */
export interface ActorInfo {
  did: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
}

/** `fm.atradio.defs#playView` — a single play event (query output item). */
export interface PlayView {
  station: StationInfo;
  playedAt: string;
  /** Present on the global feed; omitted on per-actor queries. */
  actor?: ActorInfo;
}

/** Output of `fm.atradio.getRecentlyPlayed` / `getGlobalRecentlyPlayed`. */
export interface PlayListOutput {
  cursor?: string;
  items: PlayView[];
}

/** `fm.atradio.defs#listenerCount` — unique listeners for one station. */
export interface ListenerCount {
  stationId: string;
  listeners: number;
}

/** Output of `fm.atradio.getListenerCounts`. */
export interface ListenerCountsOutput {
  counts: ListenerCount[];
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

// ---- fm.atradio.actor.status ----

/** Singleton record rkey (one status record per repo). */
export const ACTOR_STATUS_RKEY = "self";

/** `fm.atradio.actor.status` record — the actor's most recent play. */
export interface ActorStatusRecord {
  $type?: typeof NSID.actorStatus;
  station: StationInfo;
  playedAt: string;
}

// ---- fm.atradio.comment ----

/**
 * `fm.atradio.comment#mention` — a mention of another actor, anchored to a
 * UTF-8 byte range within the comment `text`.
 */
export interface Mention {
  did: string;
  /** Inclusive UTF-8 byte offset of the mention start. */
  byteStart: number;
  /** Exclusive UTF-8 byte offset of the mention end. */
  byteEnd: number;
}

/** `fm.atradio.comment#gif` — an animated GIF embedded in a comment. */
export interface GifEmbed {
  /** Direct URL of the animated GIF/MP4. */
  url: string;
  /** Smaller still/preview image URL. */
  previewUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
}

/** `fm.atradio.comment` record — a comment on a station. */
export interface CommentRecord {
  $type?: typeof NSID.comment;
  station: StationInfo;
  text: string;
  facets?: Mention[];
  gif?: GifEmbed;
  createdAt: string;
}

/** `fm.atradio.defs#commentView` — a comment paired with its uri + author. */
export interface CommentView {
  uri: string;
  author?: ActorInfo;
  station: StationInfo;
  text: string;
  facets?: Mention[];
  gif?: GifEmbed;
  createdAt: string;
}

/** Output of `fm.atradio.getComments`. */
export interface CommentListOutput {
  cursor?: string;
  total: number;
  items: CommentView[];
}

// ---- notifications ----

export type NotificationReason = "mention" | "comment";

/** `fm.atradio.defs#notificationView` — one notification for an actor. */
export interface NotificationView {
  /** URI of the subject record (the comment). */
  uri: string;
  reason: NotificationReason;
  author: ActorInfo;
  station?: StationInfo;
  /** Snapshot of the comment text. */
  text?: string;
  createdAt: string;
  isRead: boolean;
}

/** Output of `fm.atradio.getNotifications`. */
export interface NotificationListOutput {
  cursor?: string;
  /** Notifications newer than the actor's last-seen time. */
  unreadCount: number;
  items: NotificationView[];
}

/** Output of `fm.atradio.updateSeen`. */
export interface UpdateSeenOutput {
  unreadCount: number;
}

// ---- fm.atradio.reaction ----

/** `fm.atradio.reaction` record — an ephemeral emoji reaction to a station. */
export interface ReactionRecord {
  $type?: typeof NSID.reaction;
  station: StationInfo;
  emoji: string;
  createdAt: string;
}

// ---- live stream (SSE) events ----

/** A new comment appeared on the station being watched. */
export interface LiveCommentEvent {
  type: "comment";
  comment: CommentView;
}

/** Someone reacted to the station being watched. */
export interface LiveReactionEvent {
  type: "reaction";
  emoji: string;
  actor: ActorInfo;
  createdAt: string;
}

/** Union of events pushed over the per-station live (SSE) channel. */
export type LiveEvent = LiveCommentEvent | LiveReactionEvent;
