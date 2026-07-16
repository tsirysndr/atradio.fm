import type {
  ActorStatusRecord,
  AudioSettingsData,
  AudioSettingsRecord,
  CommentRecord,
  FavoriteRecord,
  GifEmbed,
  Mention,
  ReactionRecord,
  Station,
  StationDraft,
  StationInfo,
  StationRecord,
  StrongRef,
} from "./types";
import { DEFAULT_AUDIO_SETTINGS, NSID } from "./types";

/** Drop `undefined` and empty-string values so records stay minimal. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""),
  ) as T;
}

/** Parse an at-uri into its parts. */
export function parseAtUri(uri: string): {
  did: string;
  collection: string;
  rkey: string;
} {
  const m = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid at-uri: ${uri}`);
  return { did: m[1], collection: m[2], rkey: m[3] };
}

export const rkeyFromUri = (uri: string) => parseAtUri(uri).rkey;

// ---- Station <-> stationInfo (embedded snapshot) ----

export function stationToInfo(s: Station): StationInfo {
  return clean({
    stationId: s.id,
    name: s.name,
    streamUrl: s.streamUrl,
    source: s.source,
    description: s.description,
    genre: s.genre,
    homepage: s.homepage,
    logo: s.favicon,
    country: s.country,
    language: s.language,
    bitrate: s.bitrate,
    codec: s.codec,
    tags: s.tags,
  }) as StationInfo;
}

export function infoToStation(i: StationInfo): Station {
  return clean({
    id: i.stationId,
    name: i.name,
    streamUrl: i.streamUrl,
    source: i.source,
    description: i.description,
    genre: i.genre,
    homepage: i.homepage,
    favicon: i.logo,
    country: i.country,
    language: i.language,
    bitrate: i.bitrate,
    codec: i.codec,
    tags: i.tags,
  }) as Station;
}

// ---- fm.atradio.favorite ----

export function buildFavoriteRecord(
  s: Station,
  opts: { subject?: StrongRef; createdAt?: string } = {},
): FavoriteRecord {
  return clean({
    $type: NSID.favorite,
    station: stationToInfo(s),
    subject: opts.subject,
    createdAt: opts.createdAt ?? new Date().toISOString(),
  }) as FavoriteRecord;
}

export const favoriteRecordToStation = (r: FavoriteRecord): Station =>
  infoToStation(r.station);

// ---- fm.atradio.station ----

export function buildStationRecord(
  draft: StationDraft,
  createdAt?: string,
): StationRecord {
  return clean({
    $type: NSID.station,
    name: draft.name,
    streamUrl: draft.streamUrl,
    description: draft.description,
    genre: draft.genre,
    homepage: draft.homepage,
    logo: draft.logoUrl,
    createdAt: createdAt ?? new Date().toISOString(),
  }) as StationRecord;
}

/** Turn a stored station record + its rkey into an app `Station`. */
export function stationRecordToStation(
  r: StationRecord,
  rkey: string,
): Station {
  return clean({
    id: `custom:${rkey}`,
    name: r.name,
    streamUrl: r.streamUrl,
    source: "custom",
    description: r.description,
    genre: r.genre,
    homepage: r.homepage,
    favicon: r.logo,
    tags: r.tags,
  }) as Station;
}

// ---- fm.atradio.audio.settings ----

/** Build the singleton settings record. `crossfeedDirect` goes from dB to
 *  tenths of dB; every gain is rounded to the integer the lexicon requires. */
export function buildAudioSettingsRecord(
  s: AudioSettingsData,
  updatedAt?: string,
): AudioSettingsRecord {
  return {
    $type: NSID.audioSettings,
    eqEnabled: s.eqEnabled,
    eqGains: s.eqGains.map((g) => Math.round(g)),
    bass: Math.round(s.bass),
    treble: Math.round(s.treble),
    crossfeedMode: s.crossfeedMode,
    crossfeedDirect: Math.round(s.crossfeedDirect * 10),
    pbe: Math.round(s.pbe),
    pbePrecut: Math.round(s.pbePrecut),
    surroundDelay: Math.round(s.surroundDelay),
    surroundBalance: Math.round(s.surroundBalance),
    compThreshold: Math.round(s.compThreshold),
    compRatio: Math.round(s.compRatio),
    channelMode: s.channelMode,
    stereoWidth: Math.round(s.stereoWidth),
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
}

/** Read a settings record, filling anything missing with the defaults (so
 *  records written by older app versions keep working). */
export function audioSettingsRecordToData(
  r: AudioSettingsRecord,
): AudioSettingsData {
  const d = DEFAULT_AUDIO_SETTINGS;
  return {
    eqEnabled: r.eqEnabled ?? d.eqEnabled,
    eqGains: r.eqGains ?? [...d.eqGains],
    bass: r.bass ?? d.bass,
    treble: r.treble ?? d.treble,
    crossfeedMode: r.crossfeedMode ?? d.crossfeedMode,
    crossfeedDirect:
      r.crossfeedDirect != null ? r.crossfeedDirect / 10 : d.crossfeedDirect,
    pbe: r.pbe ?? d.pbe,
    pbePrecut: r.pbePrecut ?? d.pbePrecut,
    surroundDelay: r.surroundDelay ?? d.surroundDelay,
    surroundBalance: r.surroundBalance ?? d.surroundBalance,
    compThreshold: r.compThreshold ?? d.compThreshold,
    compRatio: r.compRatio ?? d.compRatio,
    channelMode: r.channelMode ?? d.channelMode,
    stereoWidth: r.stereoWidth ?? d.stereoWidth,
  };
}

// ---- fm.atradio.actor.status ----

/** Build the singleton listening-status record for a played station. */
export function buildActorStatusRecord(
  s: Station,
  playedAt?: string,
): ActorStatusRecord {
  return clean({
    $type: NSID.actorStatus,
    station: stationToInfo(s),
    playedAt: playedAt ?? new Date().toISOString(),
  }) as ActorStatusRecord;
}

// ---- fm.atradio.comment ----

/** Build a comment record for a station, with optional mention facets + gif.
 *  `text` is always included (even empty, for GIF-only comments) so `clean`
 *  doesn't strip it — the lexicon requires the field to be present. */
export function buildCommentRecord(
  s: Station,
  text: string,
  opts: { facets?: Mention[]; gif?: GifEmbed; createdAt?: string } = {},
): CommentRecord {
  const facets = opts.facets?.length ? opts.facets : undefined;
  const gif = opts.gif ? (clean({ ...opts.gif }) as GifEmbed) : undefined;
  return {
    ...(clean({
      $type: NSID.comment,
      station: stationToInfo(s),
      facets,
      gif,
      createdAt: opts.createdAt ?? new Date().toISOString(),
    }) as Omit<CommentRecord, "text">),
    text,
  };
}

// ---- fm.atradio.reaction ----

/** Build an emoji-reaction record for a station. */
export function buildReactionRecord(
  s: Station,
  emoji: string,
  createdAt?: string,
): ReactionRecord {
  return clean({
    $type: NSID.reaction,
    station: stationToInfo(s),
    emoji,
    createdAt: createdAt ?? new Date().toISOString(),
  }) as ReactionRecord;
}
