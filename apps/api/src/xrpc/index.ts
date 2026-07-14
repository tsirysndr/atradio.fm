import { Router, type Request, type Response } from "express";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { StationInfo, StationView } from "@atradio/lexicons";
import { db, schema } from "../db";
import { resolveDid } from "../lib/profile";

export const xrpcRouter = Router();

function parseLimit(v: unknown, def = 50, max = 100): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

function xrpcError(res: Response, status: number, error: string, message: string) {
  return res.status(status).json({ error, message });
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

/** GET /xrpc/fm.atradio.getFavorites?actor=&limit=&cursor= */
xrpcRouter.get("/fm.atradio.getFavorites", async (req: Request, res: Response) => {
  const actor = String(req.query.actor ?? "");
  if (!actor) return xrpcError(res, 400, "InvalidRequest", "actor is required");
  const did = await resolveDid(actor);
  if (!did) return xrpcError(res, 404, "NotFound", "actor not found");

  const limit = parseLimit(req.query.limit);
  const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

  const rows = await db
    .select()
    .from(schema.favorites)
    .where(
      cursor
        ? and(
            eq(schema.favorites.did, did),
            lt(schema.favorites.indexedAt, cursor),
          )
        : eq(schema.favorites.did, did),
    )
    .orderBy(desc(schema.favorites.indexedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const items: StationView[] = page.map((row) => ({
    uri: row.uri,
    station: row.station,
    createdAt: (row.createdAt ?? row.indexedAt).toISOString(),
  }));
  const nextCursor = hasMore
    ? page[page.length - 1]?.indexedAt.toISOString()
    : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.favorites)
    .where(eq(schema.favorites.did, did));

  return res.json({ cursor: nextCursor, total, items });
});

/** GET /xrpc/fm.atradio.getStations?actor=&limit=&cursor= */
xrpcRouter.get("/fm.atradio.getStations", async (req: Request, res: Response) => {
  const actor = String(req.query.actor ?? "");
  if (!actor) return xrpcError(res, 400, "InvalidRequest", "actor is required");
  const did = await resolveDid(actor);
  if (!did) return xrpcError(res, 404, "NotFound", "actor not found");

  const limit = parseLimit(req.query.limit);
  const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;

  const rows = await db
    .select()
    .from(schema.stations)
    .where(
      cursor
        ? and(
            eq(schema.stations.did, did),
            lt(schema.stations.indexedAt, cursor),
          )
        : eq(schema.stations.did, did),
    )
    .orderBy(desc(schema.stations.indexedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const items: StationView[] = page.map((row) => ({
    uri: row.uri,
    station: stationRowToInfo(row),
    createdAt: (row.createdAt ?? row.indexedAt).toISOString(),
  }));
  const nextCursor = hasMore
    ? page[page.length - 1]?.indexedAt.toISOString()
    : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.stations)
    .where(eq(schema.stations.did, did));

  return res.json({ cursor: nextCursor, total, items });
});

/** GET /xrpc/fm.atradio.getRecentStations?limit= — global discovery. */
xrpcRouter.get(
  "/fm.atradio.getRecentStations",
  async (req: Request, res: Response) => {
    const limit = parseLimit(req.query.limit, 30, 100);
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
  async (req: Request, res: Response) => {
    const limit = parseLimit(req.query.limit, 30, 100);
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
