import WebSocket from "ws";
import { consola } from "consola";
import { eq } from "drizzle-orm";
import {
  NSID,
  actorStatusRecordSchema,
  favoriteRecordSchema,
  stationRecordSchema,
} from "@atradio/lexicons";
import { env } from "../env";
import { db, schema } from "../db";
import { getProfile } from "../lib/profile";

const WANTED: string[] = [NSID.favorite, NSID.station, NSID.actorStatus];
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

async function ensureUser(did: string): Promise<void> {
  if (enrichedDids.has(did)) return;
  enrichedDids.add(did);
  const profile = await getProfile(did);
  await db
    .insert(schema.users)
    .values({
      did,
      handle: profile?.handle ?? null,
      displayName: profile?.displayName ?? null,
      avatarUrl: profile?.avatar ?? null,
      description: profile?.description ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.users.did,
      set: {
        handle: profile?.handle ?? null,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatar ?? null,
        description: profile?.description ?? null,
        updatedAt: new Date(),
      },
    });
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

async function processCommit(evt: JetstreamEvent): Promise<void> {
  const c = evt.commit;
  if (!c || !WANTED.includes(c.collection)) return;
  const uri = atUri(evt.did, c.collection, c.rkey);

  if (c.operation === "delete") {
    if (c.collection === NSID.favorite) {
      await db.delete(schema.favorites).where(eq(schema.favorites.uri, uri));
    } else if (c.collection === NSID.station) {
      await db.delete(schema.stations).where(eq(schema.stations.uri, uri));
    }
    // A deleted actor.status record leaves the play history intact.
    return;
  }

  // create / update
  if (c.collection === NSID.favorite) await indexFavorite(evt.did, c, uri);
  else if (c.collection === NSID.station) await indexStation(evt.did, c, uri);
  else if (c.collection === NSID.actorStatus) await indexPlay(evt.did, c);
}

async function handleEvent(evt: JetstreamEvent): Promise<void> {
  if (evt.time_us > cursor) cursor = evt.time_us;
  if (evt.kind === "commit") {
    try {
      await processCommit(evt);
    } catch (err) {
      consola.error("[jetstream] processing error", err);
    }
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
