import "@atcute/atproto"; // side-effect: augments the ambient com.atproto.* XRPC maps
import {
  Client,
  ClientResponseError,
  CredentialManager,
  ok,
  type AtpSessionData,
} from "@atcute/client";
import type { Did, Nsid } from "@atcute/lexicons";
import { now as tidNow } from "@atcute/tid";
import {
  ACTOR_STATUS_RKEY,
  AUDIO_SETTINGS_RKEY,
  audioSettingsRecordToData,
  buildActorStatusRecord,
  buildAudioSettingsRecord,
  buildCommentRecord,
  buildFavoriteRecord,
  buildStationRecord,
  NSID,
  rkeyFromUri,
  stationRecordToStation,
  type AudioSettingsData,
  type AudioSettingsRecord,
  type FavoriteRecord,
  type GifEmbed,
  type Mention,
  type Station,
  type StationDraft,
} from "@atradio/lexicons";
import { AppView } from "./appview.ts";
import { favoriteRkey } from "./favorite-rkey.ts";

/** Cast a record object to the shape atcute's putRecord expects. */
function asRecord(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

export interface LoginOptions {
  /** The account's PDS (or an entryway like `https://bsky.social`). */
  service?: string;
  identifier: string;
  password: string;
  /** Email 2FA code, if enabled. */
  code?: string;
  /** AppView base URL (defaults to `https://api.atradio.fm`). */
  appview?: string;
  /** Called whenever the session is created/refreshed — persist it here. */
  onSessionUpdate?: (session: AtpSessionData) => void;
}

export interface AgentOptions {
  appview?: string;
}

/**
 * The atradio.fm agent, mirroring the Rust SDK's `AtradioAgent`: a thin wrapper
 * over an atcute {@link Client} that exposes high-level record verbs plus a
 * read-only {@link AppView}.
 *
 * Construct it with app-password auth via {@link AtradioAgent.login}, or wrap an
 * already-authenticated client (e.g. the web's OAuth session) with
 * {@link AtradioAgent.fromClient}.
 */
export class AtradioAgent {
  readonly client: Client;
  readonly did: Did;
  readonly appview: AppView;
  readonly #manager?: CredentialManager;

  constructor(
    client: Client,
    did: Did,
    opts: AgentOptions & { manager?: CredentialManager } = {},
  ) {
    this.client = client;
    this.did = did;
    this.appview = new AppView(opts.appview);
    this.#manager = opts.manager;
  }

  /** Log in with an app password and return a ready agent. */
  static async login(opts: LoginOptions): Promise<AtradioAgent> {
    const manager = new CredentialManager({
      service: opts.service ?? "https://bsky.social",
      onSessionUpdate: opts.onSessionUpdate,
    });
    const session = await manager.login({
      identifier: opts.identifier,
      password: opts.password,
      code: opts.code,
    });
    const client = new Client({ handler: manager });
    return new AtradioAgent(client, session.did, {
      appview: opts.appview,
      manager,
    });
  }

  /** Wrap an already-authenticated atcute client (e.g. an OAuth session). */
  static fromClient(
    client: Client,
    did: Did,
    opts: AgentOptions = {},
  ): AtradioAgent {
    return new AtradioAgent(client, did, opts);
  }

  /** The current app-password session, if this agent owns one. */
  get session(): AtpSessionData | undefined {
    return this.#manager?.session;
  }

  /**
   * Keep the session alive by touching an authenticated endpoint, which makes
   * the handler refresh the token if it's near/at expiry. Call on a timer (and
   * once at startup) so writes keep working after a long idle. Rejects only if
   * the session is unrecoverable (re-login needed).
   */
  async refreshSession(): Promise<void> {
    await ok(this.client.get("com.atproto.server.getSession", {}));
  }

  // ---- writes ----------------------------------------------------------

  /**
   * Favorite a station. Idempotent: the record key is derived from the station
   * id ({@link favoriteRkey}), so favoriting twice overwrites one record. Also
   * reconciles favorites saved under the old random keys — after writing the
   * canonical record it deletes any other favorite for the same `stationId`
   * (matched on the record body, since keys differ). Returns the record URI.
   */
  async favorite(station: Station): Promise<string> {
    const rkey = await favoriteRkey(station.id);
    await ok(
      this.client.post("com.atproto.repo.putRecord", {
        input: {
          repo: this.did,
          collection: NSID.favorite as Nsid,
          rkey,
          record: asRecord(buildFavoriteRecord(station)),
        },
      }),
    );
    await this.#pruneFavorites(station.id, rkey);
    return `at://${this.did}/${NSID.favorite}/${rkey}`;
  }

  /** Unfavorite a station: delete every favorite record for its `stationId`. */
  async unfavorite(station: Station): Promise<void> {
    await this.#pruneFavorites(station.id);
  }

  /** Post a comment on a station. Returns the record URI. */
  async comment(
    station: Station,
    text: string,
    opts: { facets?: Mention[]; gif?: GifEmbed } = {},
  ): Promise<string> {
    const rkey = tidNow();
    await ok(
      this.client.post("com.atproto.repo.putRecord", {
        input: {
          repo: this.did,
          collection: NSID.comment as Nsid,
          rkey,
          record: asRecord(buildCommentRecord(station, text, opts)),
        },
      }),
    );
    return `at://${this.did}/${NSID.comment}/${rkey}`;
  }

  /** Create a custom station. Returns its rkey + the resulting `Station`. */
  async createStation(
    draft: StationDraft,
  ): Promise<{ rkey: string; station: Station }> {
    const rkey = tidNow();
    const record = buildStationRecord(draft);
    await ok(
      this.client.post("com.atproto.repo.putRecord", {
        input: {
          repo: this.did,
          collection: NSID.station as Nsid,
          rkey,
          record: asRecord(record),
        },
      }),
    );
    return { rkey, station: stationRecordToStation(record, rkey) };
  }

  /** Update the actor's play-status singleton (rkey `self`). */
  async setPlayStatus(station: Station): Promise<void> {
    await ok(
      this.client.post("com.atproto.repo.putRecord", {
        input: {
          repo: this.did,
          collection: NSID.actorStatus as Nsid,
          rkey: ACTOR_STATUS_RKEY,
          record: asRecord(buildActorStatusRecord(station)),
        },
      }),
    );
  }

  /** Delete the actor's play-status singleton. Idempotent. */
  async deletePlayStatus(): Promise<void> {
    try {
      await ok(
        this.client.post("com.atproto.repo.deleteRecord", {
          input: {
            repo: this.did,
            collection: NSID.actorStatus as Nsid,
            rkey: ACTOR_STATUS_RKEY,
          },
        }),
      );
    } catch (err) {
      if (!isRecordNotFound(err)) throw err;
    }
  }

  /** Fetch the synced audio settings, or `null` if none saved yet. */
  async getAudioSettings(): Promise<AudioSettingsData | null> {
    try {
      const out = await ok(
        this.client.get("com.atproto.repo.getRecord", {
          params: {
            repo: this.did,
            collection: NSID.audioSettings as Nsid,
            rkey: AUDIO_SETTINGS_RKEY,
          },
        }),
      );
      return audioSettingsRecordToData(
        out.value as unknown as AudioSettingsRecord,
      );
    } catch (err) {
      if (isRecordNotFound(err)) return null;
      throw err;
    }
  }

  /** Upsert the audio-settings singleton (rkey `self`). */
  async putAudioSettings(data: AudioSettingsData): Promise<void> {
    await ok(
      this.client.post("com.atproto.repo.putRecord", {
        input: {
          repo: this.did,
          collection: NSID.audioSettings as Nsid,
          rkey: AUDIO_SETTINGS_RKEY,
          record: asRecord(buildAudioSettingsRecord(data)),
        },
      }),
    );
  }

  /**
   * Mint an atproto service-auth JWT bound to `aud` (the AppView's DID service
   * reference) and `lxm` (the lexicon method) — proves to the atradio Connect
   * hub that a connection belongs to this account.
   */
  async mintServiceAuth(aud: string, lxm: string): Promise<string> {
    const out = await ok(
      this.client.get("com.atproto.server.getServiceAuth", {
        params: {
          aud: aud as Did,
          lxm: lxm as Nsid,
          exp: Math.floor(Date.now() / 1000) + 60,
        },
      }),
    );
    return out.token;
  }

  // ---- internals -------------------------------------------------------

  /** Every favorite record whose body `station.stationId` matches. */
  async #favoriteRkeysFor(stationId: string): Promise<string[]> {
    const rkeys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await ok(
        this.client.get("com.atproto.repo.listRecords", {
          params: {
            repo: this.did,
            collection: NSID.favorite as Nsid,
            limit: 100,
            cursor,
          },
        }),
      );
      for (const r of page.records) {
        const rec = r.value as unknown as FavoriteRecord;
        if (rec.station?.stationId === stationId) {
          rkeys.push(rkeyFromUri(r.uri));
        }
      }
      cursor = page.cursor;
    } while (cursor);
    return rkeys;
  }

  /** Delete every favorite for `stationId` except `keep` (best-effort). */
  async #pruneFavorites(stationId: string, keep?: string): Promise<void> {
    const rkeys = await this.#favoriteRkeysFor(stationId);
    for (const rkey of rkeys) {
      if (rkey === keep) continue;
      await ok(
        this.client.post("com.atproto.repo.deleteRecord", {
          input: {
            repo: this.did,
            collection: NSID.favorite as Nsid,
            rkey,
          },
        }),
      );
    }
  }
}

function isRecordNotFound(err: unknown): boolean {
  return err instanceof ClientResponseError && err.error === "RecordNotFound";
}
