import "@atcute/atproto";
import { ok, type Client } from "@atcute/client";
import { now as tidNow } from "@atcute/tid";
import type { Did, Nsid } from "@atcute/lexicons";
import {
  NSID,
  AUDIO_SETTINGS_RKEY,
  ACTOR_STATUS_RKEY,
  audioSettingsRecordSchema,
  buildActorStatusRecord,
  buildAudioSettingsRecord,
  buildCommentRecord,
  buildFavoriteRecord,
  buildReactionRecord,
  buildStationRecord,
  favoriteRecordToStation,
  stationRecordToStation,
  rkeyFromUri,
  type AudioSettingsData,
  type AudioSettingsRecord,
  type FavoriteRecord,
  type GifEmbed,
  type Mention,
  type StationRecord,
  type Station,
  type StationDraft,
} from "@atradio/lexicons";

export interface StoredStation {
  station: Station;
  rkey: string;
  uri: string;
}

async function listAll(
  client: Client,
  repo: Did,
  collection: string,
): Promise<{ uri: string; value: unknown }[]> {
  const out: { uri: string; value: unknown }[] = [];
  let cursor: string | undefined;
  do {
    const page = await ok(
      client.get("com.atproto.repo.listRecords", {
        params: { repo, collection: collection as Nsid, limit: 100, cursor },
      }),
    );
    for (const r of page.records) out.push({ uri: r.uri, value: r.value });
    cursor = page.cursor;
  } while (cursor);
  return out;
}

export async function listFavorites(
  client: Client,
  did: Did,
): Promise<StoredStation[]> {
  const records = await listAll(client, did, NSID.favorite);
  return records.map((r) => {
    const rec = r.value as unknown as FavoriteRecord;
    return {
      station: favoriteRecordToStation(rec),
      rkey: rkeyFromUri(r.uri),
      uri: r.uri,
    };
  });
}

export async function listStations(
  client: Client,
  did: Did,
): Promise<StoredStation[]> {
  const records = await listAll(client, did, NSID.station);
  return records.map((r) => {
    const rec = r.value as unknown as StationRecord;
    const rkey = rkeyFromUri(r.uri);
    return { station: stationRecordToStation(rec, rkey), rkey, uri: r.uri };
  });
}

/** Deterministic record key for a favorite: the first 8 bytes (64 bits) of
 *  sha256(stationId) as lowercase hex — a stable 16-char rkey.
 *
 *  Must stay byte-for-byte identical to the atradio-sdk (Rust) `favorite_rkey`
 *  so a station maps to the same record on CLI and web: favoriting it is
 *  idempotent (putRecord overwrites the one record) and can never duplicate,
 *  even across devices or from stale local state. */
export async function favoriteRkey(stationId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stationId),
  );
  const bytes = new Uint8Array(digest).subarray(0, 8);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function putFavorite(
  client: Client,
  did: Did,
  station: Station,
): Promise<string> {
  const rkey = await favoriteRkey(station.id);
  await ok(
    client.post("com.atproto.repo.putRecord", {
      input: {
        repo: did,
        collection: NSID.favorite as Nsid,
        rkey,
        record: buildFavoriteRecord(station) as unknown as Record<
          string,
          unknown
        >,
      },
    }),
  );
  return rkey;
}

export async function putStation(
  client: Client,
  did: Did,
  draft: StationDraft,
): Promise<{ rkey: string; station: Station }> {
  const rkey = tidNow();
  const record = buildStationRecord(draft);
  await ok(
    client.post("com.atproto.repo.putRecord", {
      input: {
        repo: did,
        collection: NSID.station as Nsid,
        rkey,
        record: record as unknown as Record<string, unknown>,
      },
    }),
  );
  return { rkey, station: stationRecordToStation(record, rkey) };
}

export async function deleteAtradioRecord(
  client: Client,
  did: Did,
  collection: string,
  rkey: string,
): Promise<void> {
  await ok(
    client.post("com.atproto.repo.deleteRecord", {
      input: { repo: did, collection: collection as Nsid, rkey },
    }),
  );
}

/** Fetch the actor's singleton audio-settings record; null when absent
 *  (never synced) or invalid. */
export async function getAudioSettings(
  client: Client,
  did: Did,
): Promise<AudioSettingsRecord | null> {
  const res = await client.get("com.atproto.repo.getRecord", {
    params: {
      repo: did,
      collection: NSID.audioSettings as Nsid,
      rkey: AUDIO_SETTINGS_RKEY,
    },
  });
  if (!res.ok) return null;
  const parsed = audioSettingsRecordSchema.safeParse(res.data.value);
  return parsed.success ? (parsed.data as AudioSettingsRecord) : null;
}

/** Write the actor's singleton listening-status record (rkey `self`),
 *  overwriting it with the station they just played. */
export async function putActorStatus(
  client: Client,
  did: Did,
  station: Station,
): Promise<void> {
  await ok(
    client.post("com.atproto.repo.putRecord", {
      input: {
        repo: did,
        collection: NSID.actorStatus as Nsid,
        rkey: ACTOR_STATUS_RKEY,
        record: buildActorStatusRecord(station) as unknown as Record<
          string,
          unknown
        >,
      },
    }),
  );
}

/** Delete the actor's listening-status record (rkey `self`). Used when no
 *  player is online anymore, so the user stops appearing as "listening".
 *  Idempotent — a missing record is treated as already-clean. */
export async function deleteActorStatus(
  client: Client,
  did: Did,
): Promise<void> {
  try {
    await ok(
      client.post("com.atproto.repo.deleteRecord", {
        input: {
          repo: did,
          collection: NSID.actorStatus as Nsid,
          rkey: ACTOR_STATUS_RKEY,
        },
      }),
    );
  } catch {
    /* already gone / transient — nothing to clean up */
  }
}

/** Write a comment on a station to the user's repo; returns its rkey + uri. */
export async function putComment(
  client: Client,
  did: Did,
  station: Station,
  text: string,
  opts: { facets?: Mention[]; gif?: GifEmbed } = {},
): Promise<{ rkey: string; uri: string }> {
  const rkey = tidNow();
  await ok(
    client.post("com.atproto.repo.putRecord", {
      input: {
        repo: did,
        collection: NSID.comment as Nsid,
        rkey,
        record: buildCommentRecord(station, text, opts) as unknown as Record<
          string,
          unknown
        >,
      },
    }),
  );
  return { rkey, uri: `at://${did}/${NSID.comment}/${rkey}` };
}

/** Edit one of the user's own comments: overwrite the record at its rkey,
 *  preserving its original createdAt (so ordering doesn't jump). */
export async function updateComment(
  client: Client,
  did: Did,
  uri: string,
  station: Station,
  text: string,
  opts: { facets?: Mention[]; gif?: GifEmbed; createdAt?: string } = {},
): Promise<void> {
  await ok(
    client.post("com.atproto.repo.putRecord", {
      input: {
        repo: did,
        collection: NSID.comment as Nsid,
        rkey: rkeyFromUri(uri),
        record: buildCommentRecord(station, text, opts) as unknown as Record<
          string,
          unknown
        >,
      },
    }),
  );
}

/** Delete one of the user's own comments (by its at-uri). */
export async function deleteComment(
  client: Client,
  did: Did,
  uri: string,
): Promise<void> {
  await deleteAtradioRecord(client, did, NSID.comment, rkeyFromUri(uri));
}

/** Write an ephemeral emoji reaction to a station; returns its rkey. */
export async function putReaction(
  client: Client,
  did: Did,
  station: Station,
  emoji: string,
): Promise<string> {
  const rkey = tidNow();
  await ok(
    client.post("com.atproto.repo.putRecord", {
      input: {
        repo: did,
        collection: NSID.reaction as Nsid,
        rkey,
        record: buildReactionRecord(station, emoji) as unknown as Record<
          string,
          unknown
        >,
      },
    }),
  );
  return rkey;
}

/** Write the actor's singleton audio-settings record (rkey `self`). */
export async function putAudioSettings(
  client: Client,
  did: Did,
  settings: AudioSettingsData,
): Promise<void> {
  await ok(
    client.post("com.atproto.repo.putRecord", {
      input: {
        repo: did,
        collection: NSID.audioSettings as Nsid,
        rkey: AUDIO_SETTINGS_RKEY,
        record: buildAudioSettingsRecord(settings) as unknown as Record<
          string,
          unknown
        >,
      },
    }),
  );
}
