import { Router, type Request, type Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import type { PlayView, StationInfo, StationView } from "@atradio/lexicons";
import { db, schema } from "../db";
import { resolveDid } from "../lib/profile";
import { cacheJson } from "../cache";

/** Clamp a raw `limit` query param to [1, 100] with a fallback default. */
function clampLimit(raw: unknown, fallback: number): number {
  return Math.min(Math.max(1, Number(raw) || fallback), 100);
}

export const xrpcRouter = Router();

/** Shared query params for the list endpoints, incl. required `actor`. */
const listParams = z.object({
  actor: z.string().trim().min(1, "actor is required"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
  q: z.string().trim().min(1).optional(),
  source: z.enum(["radio-browser", "tunein", "custom"]).optional(),
  sort: z.enum(["recent", "name", "-name"]).optional().default("recent"),
});
type ListParams = z.infer<typeof listParams>;

function xrpcError(res: Response, status: number, error: string, message: string) {
  return res.status(status).json({ error, message });
}

/** Validate the query params; sends an XRPC InvalidRequest and returns null on failure. */
function parseParams(req: Request, res: Response): ListParams | null {
  const parsed = listParams.safeParse(req.query);
  if (!parsed.success) {
    xrpcError(
      res,
      400,
      "InvalidRequest",
      parsed.error.issues[0]?.message ?? "invalid parameters",
    );
    return null;
  }
  return parsed.data;
}

type StationRow = typeof schema.stations.$inferSelect;

function stationRowToInfo(row: StationRow): StationInfo {
  return {
    stationId: `custom:${row.rkey}`,
    name: row.name,
    streamUrl: row.streamUrl,
    source: "custom",
    description: row.description ?? undefined,
    genre: row.genre ?? undefined,
    homepage: row.homepage ?? undefined,
    logo: row.logoUrl ?? undefined,
    tags: row.tags ?? undefined,
  };
}

/** GET /xrpc/fm.atradio.getFavorites?actor=&limit=&cursor=&q=&source=&sort= */
xrpcRouter.get("/fm.atradio.getFavorites", cacheJson(20), async (req: Request, res: Response) => {
  const params = parseParams(req, res);
  if (!params) return;
  const did = await resolveDid(params.actor);
  if (!did) return xrpcError(res, 404, "NotFound", "actor not found");

  const { limit, q, source, sort } = params;
  const like = q ? `%${q}%` : null;
  const nameExpr = sql`(${schema.favorites.station} ->> 'name')`;

  // Filters shared by the page + count queries.
  const filter: SQL | undefined = and(
    eq(schema.favorites.did, did),
    source
      ? sql`(${schema.favorites.station} ->> 'source') = ${source}`
      : undefined,
    like
      ? sql`(${nameExpr} ILIKE ${like} OR (${schema.favorites.station} ->> 'genre') ILIKE ${like})`
      : undefined,
  );

  const cursor =
    sort === "recent" && params.cursor ? new Date(params.cursor) : null;
  const orderBy =
    sort === "name"
      ? asc(nameExpr)
      : sort === "-name"
        ? desc(nameExpr)
        : desc(schema.favorites.indexedAt);

  const rows = await db
    .select()
    .from(schema.favorites)
    .where(cursor ? and(filter, lt(schema.favorites.indexedAt, cursor)) : filter)
    .orderBy(orderBy)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const items: StationView[] = page.map((row) => ({
    uri: row.uri,
    station: row.station,
    createdAt: (row.createdAt ?? row.indexedAt).toISOString(),
  }));
  const nextCursor =
    hasMore && sort === "recent"
      ? page[page.length - 1]?.indexedAt.toISOString()
      : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.favorites)
    .where(filter);

  return res.json({ cursor: nextCursor, total, items });
});

/** GET /xrpc/fm.atradio.getStations?actor=&limit=&cursor=&q=&source=&sort= */
xrpcRouter.get("/fm.atradio.getStations", cacheJson(20), async (req: Request, res: Response) => {
  const params = parseParams(req, res);
  if (!params) return;
  const did = await resolveDid(params.actor);
  if (!did) return xrpcError(res, 404, "NotFound", "actor not found");

  const { limit, q, source, sort } = params;
  // Every station is `source: custom`; any other source filter yields nothing.
  if (source && source !== "custom") return res.json({ total: 0, items: [] });

  const like = q ? `%${q}%` : null;
  const filter: SQL | undefined = and(
    eq(schema.stations.did, did),
    like
      ? or(ilike(schema.stations.name, like), ilike(schema.stations.genre, like))
      : undefined,
  );

  const cursor =
    sort === "recent" && params.cursor ? new Date(params.cursor) : null;
  const orderBy =
    sort === "name"
      ? asc(schema.stations.name)
      : sort === "-name"
        ? desc(schema.stations.name)
        : desc(schema.stations.indexedAt);

  const rows = await db
    .select()
    .from(schema.stations)
    .where(cursor ? and(filter, lt(schema.stations.indexedAt, cursor)) : filter)
    .orderBy(orderBy)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const items: StationView[] = page.map((row) => ({
    uri: row.uri,
    station: stationRowToInfo(row),
    createdAt: (row.createdAt ?? row.indexedAt).toISOString(),
  }));
  const nextCursor =
    hasMore && sort === "recent"
      ? page[page.length - 1]?.indexedAt.toISOString()
      : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.stations)
    .where(filter);

  return res.json({ cursor: nextCursor, total, items });
});

/** GET /xrpc/fm.atradio.getRecentStations?limit= — global discovery. */
xrpcRouter.get(
  "/fm.atradio.getRecentStations",
  cacheJson(60),
  async (req: Request, res: Response) => {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 30), 100);
    const rows = await db
      .select()
      .from(schema.stations)
      .orderBy(desc(schema.stations.indexedAt))
      .limit(limit);
    const items: StationView[] = rows.map((row) => ({
      uri: row.uri,
      station: stationRowToInfo(row),
      createdAt: (row.createdAt ?? row.indexedAt).toISOString(),
    }));
    return res.json({ items });
  },
);

/** GET /xrpc/fm.atradio.getPopularStations?limit= — most-favorited. */
xrpcRouter.get(
  "/fm.atradio.getPopularStations",
  cacheJson(60),
  async (req: Request, res: Response) => {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 30), 100);
    const rows = await db
      .select({
        stationId: schema.favorites.stationId,
        station: sql<StationInfo>`(array_agg(${schema.favorites.station}))[1]`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.favorites)
      .groupBy(schema.favorites.stationId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    const items = rows.map((r) => ({ station: r.station, count: r.count }));
    return res.json({ items });
  },
);

/**
 * GET /xrpc/fm.atradio.getRecentlyPlayed?actor=&limit=&cursor=
 * A user's recently played stations, one entry per distinct station (its most
 * recent play), newest first. Cursor paginates on last-played time.
 */
xrpcRouter.get(
  "/fm.atradio.getRecentlyPlayed",
  cacheJson(20),
  async (req: Request, res: Response) => {
    const actor = String(req.query.actor ?? "").trim();
    if (!actor) return xrpcError(res, 400, "InvalidRequest", "actor is required");
    const did = await resolveDid(actor);
    if (!did) return xrpcError(res, 404, "NotFound", "actor not found");

    const limit = clampLimit(req.query.limit, 30);
    const cursor =
      typeof req.query.cursor === "string" ? new Date(req.query.cursor) : null;
    const lastPlayed = sql<Date>`max(${schema.recentlyPlayed.playedAt})`;

    const rows = await db
      .select({
        station: sql<StationInfo>`(array_agg(${schema.recentlyPlayed.station} ORDER BY ${schema.recentlyPlayed.playedAt} DESC))[1]`,
        playedAt: lastPlayed,
      })
      .from(schema.recentlyPlayed)
      .where(eq(schema.recentlyPlayed.did, did))
      .groupBy(schema.recentlyPlayed.stationId)
      .having(cursor ? lt(lastPlayed, cursor) : undefined)
      .orderBy(desc(lastPlayed))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const items: PlayView[] = page.map((r) => ({
      station: r.station,
      playedAt: new Date(r.playedAt).toISOString(),
    }));
    const nextCursor = hasMore
      ? new Date(page[page.length - 1]!.playedAt).toISOString()
      : undefined;
    return res.json({ cursor: nextCursor, items });
  },
);

/**
 * GET /xrpc/fm.atradio.getGlobalRecentlyPlayed?limit=&cursor=
 * Platform-wide play events (newest first), each paired with the actor who
 * played it. Cursor paginates on play time.
 */
xrpcRouter.get(
  "/fm.atradio.getGlobalRecentlyPlayed",
  cacheJson(20),
  async (req: Request, res: Response) => {
    const limit = clampLimit(req.query.limit, 30);
    const cursor =
      typeof req.query.cursor === "string" ? new Date(req.query.cursor) : null;

    // One entry per actor (their most recent play) — a "story" row, so a busy
    // listener doesn't fill the feed. Cursor paginates on that latest-play time.
    const lastPlayed = sql<Date>`max(${schema.recentlyPlayed.playedAt})`;
    const rows = await db
      .select({
        station: sql<StationInfo>`(array_agg(${schema.recentlyPlayed.station} ORDER BY ${schema.recentlyPlayed.playedAt} DESC))[1]`,
        playedAt: lastPlayed,
        did: schema.recentlyPlayed.did,
        handle: schema.users.handle,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.recentlyPlayed)
      .leftJoin(
        schema.users,
        eq(schema.users.did, schema.recentlyPlayed.did),
      )
      .groupBy(
        schema.recentlyPlayed.did,
        schema.users.handle,
        schema.users.displayName,
        schema.users.avatarUrl,
      )
      .having(cursor ? lt(lastPlayed, cursor) : undefined)
      .orderBy(desc(lastPlayed))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const items: PlayView[] = page.map((r) => ({
      station: r.station,
      playedAt: new Date(r.playedAt).toISOString(),
      actor: {
        did: r.did,
        handle: r.handle ?? undefined,
        displayName: r.displayName ?? undefined,
        avatar: r.avatarUrl ?? undefined,
      },
    }));
    const nextCursor = hasMore
      ? new Date(page[page.length - 1]!.playedAt).toISOString()
      : undefined;
    return res.json({ cursor: nextCursor, items });
  },
);

/**
 * GET /xrpc/fm.atradio.getListenerCounts?stations=id1,id2,…
 * Unique-listener counts (distinct actors who played each station).
 */
xrpcRouter.get(
  "/fm.atradio.getListenerCounts",
  cacheJson(30),
  async (req: Request, res: Response) => {
    const ids = String(req.query.stations ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (ids.length === 0) return res.json({ counts: [] });

    const rows = await db
      .select({
        stationId: schema.recentlyPlayed.stationId,
        listeners: sql<number>`count(distinct ${schema.recentlyPlayed.did})::int`,
      })
      .from(schema.recentlyPlayed)
      .where(inArray(schema.recentlyPlayed.stationId, ids))
      .groupBy(schema.recentlyPlayed.stationId);
    return res.json({ counts: rows });
  },
);
