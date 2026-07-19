import WebSocket from "ws";
import { consola } from "consola";
import { eq, isNull } from "drizzle-orm";
import {
  NSID,
  actorStatusRecordSchema,
  commentRecordSchema,
  favoriteRecordSchema,
  reactionRecordSchema,
  stationRecordSchema,
  type ActorInfo,
} from "@atradio/lexicons";
import { env } from "../env";
import { db, schema } from "../db";
import { getProfile, getProfiles } from "../lib/profile";
import { publishLive } from "../live/bus";
import { claimFirstDelivery, enqueueFirehoseEmbed } from "../discord/firehose";
import { buildFirehoseEmbed } from "../discord/format";

const WANTED: string[] = [
  NSID.favorite,
  NSID.station,
  NSID.actorStatus,
  NSID.comment,
  NSID.reaction,
];
const CURSOR_ID = "global";

interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: "commit" | "identity" | "account";
  commit?: {
    operation: "create" | "update" | "delete";
    collection: string;
    rkey: string;
    record?: unknown;
    cid?: string;
  };
  identity?: { handle?: string };
}

/** Highest time_us processed across all connections (for resume). */
let cursor = 0;
/** DIDs whose profile we've already enriched this run. */
const enrichedDids = new Set<string>();

function atUri(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`;
}

/** How long a cached profile is trusted before we refresh it from bsky. */
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

async function ensureUser(did: string): Promise<void> {
  if (enrichedDids.has(did)) return;

  // The users table is our profile cache. If we already hold a good handle that
  // was refreshed within the TTL, trust it instead of hitting bsky again — that
  // avoids the rate-limited-null lookups that were clobbering cached handles.
  const [cached] = await db
    .select({ handle: schema.users.handle, updatedAt: schema.users.updatedAt })
    .from(schema.users)
    .where(eq(schema.users.did, did))
    .limit(1);
  if (cached?.handle && Date.now() - cached.updatedAt.getTime() < PROFILE_TTL_MS) {
    enrichedDids.add(did);
    return;
  }

  const profile = await getProfile(did);

  // A failed lookup (bsky rate-limit, transient error) must NOT overwrite an
  // already-good handle with null — that's what silently blanked every actor to
  // "someone". Just make sure a bare row exists so the join resolves, and leave
  // the DID un-enriched so the next event retries the profile fetch.
  if (!profile) {
    await db
      .insert(schema.users)
      .values({ did, updatedAt: new Date() })
      .onConflictDoNothing({ target: schema.users.did });
    return;
  }

  enrichedDids.add(did);
  const set = {
    handle: profile.handle,
    displayName: profile.displayName ?? null,
    avatarUrl: profile.avatar ?? null,
    description: profile.description ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.users)
    .values({ did, ...set })
    .onConflictDoUpdate({ target: schema.users.did, set });
}

/**
 * One-shot repair for rows whose handle was previously blanked to null. Re-
 * resolves them in batches via the AppView and refills the cache. Genuinely
 * unresolvable DIDs (deactivated accounts) stay null and simply retry next run.
 */
async function backfillMissingHandles(): Promise<void> {
  const rows = await db
    .select({ did: schema.users.did })
    .from(schema.users)
    .where(isNull(schema.users.handle))
    .limit(1000);
  if (rows.length === 0) return;
  consola.info(`[jetstream] backfilling ${rows.length} missing handle(s)`);

  let healed = 0;
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25).map((r) => r.did);
    const profiles = await getProfiles(batch);
    for (const p of profiles) {
      if (!p.handle) continue;
      await db
        .update(schema.users)
        .set({
          handle: p.handle,
          displayName: p.displayName ?? null,
          avatarUrl: p.avatar ?? null,
          description: p.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.did, p.did));
      enrichedDids.add(p.did);
      healed++;
    }
    // Be gentle with the public AppView between batches.
    await new Promise((r) => setTimeout(r, 250));
  }
  consola.info(`[jetstream] backfill healed ${healed}/${rows.length} handle(s)`);
}

type Commit = NonNullable<JetstreamEvent["commit"]>;

/** Upsert a fm.atradio.favorite record. */
async function indexFavorite(did: string, c: Commit, uri: string): Promise<void> {
  const parsed = favoriteRecordSchema.safeParse(c.record);
  if (!parsed.success) return;
  const r = parsed.data;
  await ensureUser(did);
  await db
    .insert(schema.favorites)
    .values({
      uri,
      did,
      rkey: c.rkey,
      stationId: r.station.stationId,
      station: r.station,
      subjectUri: r.subject?.uri ?? null,
      createdAt: new Date(r.createdAt),
      indexedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.favorites.uri,
      set: {
        stationId: r.station.stationId,
        station: r.station,
        subjectUri: r.subject?.uri ?? null,
        createdAt: new Date(r.createdAt),
        indexedAt: new Date(),
      },
    });
}

/** Upsert a fm.atradio.station record. */
async function indexStation(did: string, c: Commit, uri: string): Promise<void> {
  const parsed = stationRecordSchema.safeParse(c.record);
  if (!parsed.success) return;
  const r = parsed.data;
  await ensureUser(did);
  const values = {
    uri,
    did,
    rkey: c.rkey,
    name: r.name,
    streamUrl: r.streamUrl,
    description: r.description ?? null,
    genre: r.genre ?? null,
    homepage: r.homepage ?? null,
    logoUrl: r.logo ?? null,
    tags: r.tags ?? null,
    createdAt: new Date(r.createdAt),
    indexedAt: new Date(),
  };
  await db
    .insert(schema.stations)
    .values(values)
    .onConflictDoUpdate({
      target: schema.stations.uri,
      set: {
        name: values.name,
        streamUrl: values.streamUrl,
        description: values.description,
        genre: values.genre,
        homepage: values.homepage,
        logoUrl: values.logoUrl,
        tags: values.tags,
        createdAt: values.createdAt,
        indexedAt: values.indexedAt,
      },
    });
}

/** Record a play from a fm.atradio.actor.status update. The record is a
 *  singleton (rkey `self`) so each create/update is one play; we append a
 *  history row keyed by (did, playedAt), ignoring idempotent replays. */
async function indexPlay(did: string, c: Commit): Promise<void> {
  const parsed = actorStatusRecordSchema.safeParse(c.record);
  if (!parsed.success) return;
  const r = parsed.data;
  await ensureUser(did);
  await db
    .insert(schema.recentlyPlayed)
    .values({
      did,
      stationId: r.station.stationId,
      station: r.station,
      playedAt: new Date(r.playedAt),
      indexedAt: new Date(),
    })
    .onConflictDoNothing();
}

/** Distinct mentioned DIDs from a comment's facets (excluding the author). */
function mentionedDids(facets: { did: string }[] | undefined, author: string): string[] {
  if (!facets?.length) return [];
  const out = new Set<string>();
  for (const f of facets) if (f.did && f.did !== author) out.add(f.did);
  return [...out];
}

/**
 * Fan out notifications for a freshly-indexed comment: one per mentioned actor,
 * plus one for the station's owner when it's a custom station someone else made.
 * Notifications for this comment are rebuilt from scratch each time so edits
 * (added/removed mentions) stay consistent.
 */
async function fanoutCommentNotifications(
  author: string,
  uri: string,
  stationId: string,
  station: unknown,
  text: string,
  facets: { did: string }[] | undefined,
  createdAt: Date,
): Promise<void> {
  await db
    .delete(schema.notifications)
    .where(eq(schema.notifications.subjectUri, uri));

  const recipients = new Map<string, "mention" | "comment">();
  for (const did of mentionedDids(facets, author)) recipients.set(did, "mention");

  // The owner of a custom station gets a "comment" notification (unless they're
  // the author or already mentioned). Owner is whoever authored the station
  // record with this rkey.
  if (stationId.startsWith("custom:")) {
    const rkey = stationId.slice("custom:".length);
    const [owner] = await db
      .select({ did: schema.stations.did })
      .from(schema.stations)
      .where(eq(schema.stations.rkey, rkey))
      .limit(1);
    if (owner?.did && owner.did !== author && !recipients.has(owner.did)) {
      recipients.set(owner.did, "comment");
    }
  }

  if (recipients.size === 0) return;

  const rows = [...recipients].map(([recipientDid, reason]) => ({
    id: `${reason}:${uri}:${recipientDid}`,
    recipientDid,
    authorDid: author,
    reason,
    subjectUri: uri,
    stationId,
    station: station as never,
    text,
    createdAt,
    indexedAt: new Date(),
  }));
  await db.insert(schema.notifications).values(rows).onConflictDoNothing();
}

/** Look up an actor's public snapshot from the users cache (for live events). */
async function getActorInfo(did: string): Promise<ActorInfo> {
  const [u] = await db
    .select({
      handle: schema.users.handle,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.users)
    .where(eq(schema.users.did, did))
    .limit(1);
  return {
    did,
    handle: u?.handle ?? undefined,
    displayName: u?.displayName ?? undefined,
    avatar: u?.avatarUrl ?? undefined,
  };
}

/** Upsert a fm.atradio.comment record, (re)build notifications, broadcast live. */
async function indexComment(did: string, c: Commit, uri: string): Promise<void> {
  const parsed = commentRecordSchema.safeParse(c.record);
  if (!parsed.success) return;
  const r = parsed.data;
  await ensureUser(did);
  const createdAt = new Date(r.createdAt);
  const values = {
    uri,
    did,
    rkey: c.rkey,
    stationId: r.station.stationId,
    station: r.station,
    text: r.text,
    facets: r.facets ?? null,
    gif: r.gif ?? null,
    createdAt,
    indexedAt: new Date(),
  };
  await db
    .insert(schema.comments)
    .values(values)
    .onConflictDoUpdate({
      target: schema.comments.uri,
      set: {
        stationId: values.stationId,
        station: values.station,
        text: values.text,
        facets: values.facets,
        gif: values.gif,
        createdAt: values.createdAt,
        indexedAt: values.indexedAt,
      },
    });

  await fanoutCommentNotifications(
    did,
    uri,
    r.station.stationId,
    r.station,
    r.text,
    r.facets,
    createdAt,
  );

  // Only broadcast fresh comments (creates) so an edit doesn't re-pop the feed.
  if (c.operation === "create") {
    publishLive(r.station.stationId, {
      type: "comment",
      comment: {
        uri,
        author: await getActorInfo(did),
        station: r.station,
        text: r.text,
        facets: r.facets,
        gif: r.gif,
        createdAt: r.createdAt,
      },
    });
  }
}

/** Store a fm.atradio.reaction record and broadcast the floating emoji live. */
async function indexReaction(did: string, c: Commit, uri: string): Promise<void> {
  const parsed = reactionRecordSchema.safeParse(c.record);
  if (!parsed.success) return;
  const r = parsed.data;
  await ensureUser(did);
  await db
    .insert(schema.reactions)
    .values({
      uri,
      did,
      rkey: c.rkey,
      stationId: r.station.stationId,
      emoji: r.emoji,
      createdAt: new Date(r.createdAt),
      indexedAt: new Date(),
    })
    .onConflictDoNothing();

  if (c.operation === "create") {
    publishLive(r.station.stationId, {
      type: "reaction",
      emoji: r.emoji,
      actor: await getActorInfo(did),
      createdAt: r.createdAt,
    });
  }
}

async function processCommit(evt: JetstreamEvent): Promise<void> {
  const c = evt.commit;
  if (!c || !WANTED.includes(c.collection)) return;
  const uri = atUri(evt.did, c.collection, c.rkey);

  if (c.operation === "delete") {
    if (c.collection === NSID.favorite) {
      await db.delete(schema.favorites).where(eq(schema.favorites.uri, uri));
    } else if (c.collection === NSID.station) {
      await db.delete(schema.stations).where(eq(schema.stations.uri, uri));
    } else if (c.collection === NSID.comment) {
      await db.delete(schema.comments).where(eq(schema.comments.uri, uri));
      await db
        .delete(schema.notifications)
        .where(eq(schema.notifications.subjectUri, uri));
    } else if (c.collection === NSID.reaction) {
      await db.delete(schema.reactions).where(eq(schema.reactions.uri, uri));
    }
    // A deleted actor.status record leaves the play history intact.
    return;
  }

  // create / update
  if (c.collection === NSID.favorite) await indexFavorite(evt.did, c, uri);
  else if (c.collection === NSID.station) await indexStation(evt.did, c, uri);
  else if (c.collection === NSID.actorStatus) await indexPlay(evt.did, c);
  else if (c.collection === NSID.comment) await indexComment(evt.did, c, uri);
  else if (c.collection === NSID.reaction) await indexReaction(evt.did, c, uri);
}

/**
 * Mirror a fm.atradio.* commit to the Discord #firehose channel. Runs after
 * indexing so the actor's profile is already cached (enriches the embed with
 * avatar/handle). Identity/account events and other collections are skipped.
 */
async function forwardCommitToFirehose(evt: JetstreamEvent): Promise<void> {
  const c = evt.commit;
  if (!c || !WANTED.includes(c.collection)) return;
  // Skip redundant deliveries of the same record from our other Jetstream
  // connections. cid pins the exact record version for create/update; deletes
  // have none, so operation+rkey identifies them. time_us differs per host, so
  // it can't be part of the key.
  const key = `${c.operation}:${c.collection}:${evt.did}:${c.rkey}:${c.cid ?? ""}`;
  if (!claimFirstDelivery(key)) return;
  try {
    const embed = buildFirehoseEmbed(c, await getActorInfo(evt.did));
    if (embed) enqueueFirehoseEmbed(embed);
  } catch (err) {
    consola.warn("[firehose] failed to build embed", err);
  }
}

async function handleEvent(evt: JetstreamEvent): Promise<void> {
  if (evt.time_us > cursor) cursor = evt.time_us;
  if (evt.kind === "commit") {
    try {
      await processCommit(evt);
    } catch (err) {
      consola.error("[jetstream] processing error", err);
    }
    await forwardCommitToFirehose(evt);
  }
}

function subscribeUrl(host: string): string {
  const params = new URLSearchParams();
  for (const c of WANTED) params.append("wantedCollections", c);
  if (cursor > 0) params.set("cursor", String(cursor));
  return `wss://${host}/subscribe?${params.toString()}`;
}

/** Connect to a single Jetstream host with auto-reconnect. */
function connect(host: string, signal: AbortSignal): void {
  if (signal.aborted) return;
  // Force IPv4: some networks advertise AAAA records but can't route IPv6, and
  // Node's dual-stack fallback can stall (ETIMEDOUT) instead of trying IPv4.
  const ws = new WebSocket(subscribeUrl(host), {
    family: 4,
    handshakeTimeout: 15000,
  });

  ws.on("open", () => consola.success(`[jetstream] connected ${host}`));
  ws.on("message", (data) => {
    try {
      void handleEvent(JSON.parse(data.toString()) as JetstreamEvent);
    } catch {
      /* ignore malformed frames */
    }
  });
  const reconnect = (why: string) => {
    if (signal.aborted) return;
    consola.warn(`[jetstream] ${host} ${why}; reconnecting in 3s`);
    setTimeout(() => connect(host, signal), 3000);
  };
  ws.on("close", () => reconnect("closed"));
  ws.on("error", (err: NodeJS.ErrnoException) => {
    consola.error(`[jetstream] ${host} error`, err.code ?? err.message);
    ws.close();
  });
}

async function loadCursor(): Promise<void> {
  const [row] = await db
    .select()
    .from(schema.jetstreamCursor)
    .where(eq(schema.jetstreamCursor.id, CURSOR_ID));
  if (row?.timeUs) {
    cursor = row.timeUs;
    consola.info(`[jetstream] resuming from cursor ${cursor}`);
  }
}

async function persistCursor(): Promise<void> {
  if (cursor <= 0) return;
  await db
    .insert(schema.jetstreamCursor)
    .values({ id: CURSOR_ID, timeUs: cursor, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.jetstreamCursor.id,
      set: { timeUs: cursor, updatedAt: new Date() },
    });
}

/** Start consuming all Jetstream hosts simultaneously. */
export async function startJetstream(): Promise<() => void> {
  await loadCursor();

  // Heal any handles a previous run blanked to null (fire-and-forget).
  void backfillMissingHandles().catch((err) =>
    consola.error("[jetstream] handle backfill failed", err),
  );

  const controller = new AbortController();
  for (const host of env.JETSTREAM_HOSTS) connect(host, controller.signal);

  const timer = setInterval(() => {
    void persistCursor().catch((err) =>
      consola.error("[jetstream] cursor persist failed", err),
    );
  }, 5000);

  consola.info(
    `[jetstream] subscribed to ${env.JETSTREAM_HOSTS.length} hosts for ${WANTED.join(", ")}`,
  );

  return () => {
    controller.abort();
    clearInterval(timer);
    void persistCursor();
  };
}
