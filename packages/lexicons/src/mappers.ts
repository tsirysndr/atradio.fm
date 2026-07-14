import type {
  FavoriteRecord,
  Station,
  StationDraft,
  StationInfo,
  StationRecord,
  StrongRef,
} from "./types";
import { NSID } from "./types";

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
