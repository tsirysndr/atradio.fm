import {
  pgTable,
  text,
  jsonb,
  bigint,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { StationInfo } from "@atradio/lexicons";

/** Actors we've indexed (enriched from app.bsky.actor.getProfile). */
export const users = pgTable("users", {
  did: text("did").primaryKey(),
  handle: text("handle"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  description: text("description"),
  indexedAt: timestamp("indexed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** fm.atradio.station records (from Jetstream). */
export const stations = pgTable(
  "stations",
  {
    uri: text("uri").primaryKey(),
    did: text("did").notNull(),
    rkey: text("rkey").notNull(),
    name: text("name").notNull(),
    streamUrl: text("stream_url").notNull(),
    description: text("description"),
    genre: text("genre"),
    homepage: text("homepage"),
    logoUrl: text("logo_url"),
    tags: jsonb("tags").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("stations_did_idx").on(t.did)],
);

/** fm.atradio.favorite records (from Jetstream). */
export const favorites = pgTable(
  "favorites",
  {
    uri: text("uri").primaryKey(),
    did: text("did").notNull(),
    rkey: text("rkey").notNull(),
    stationId: text("station_id").notNull(),
    station: jsonb("station").$type<StationInfo>().notNull(),
    subjectUri: text("subject_uri"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("favorites_did_idx").on(t.did),
    index("favorites_station_id_idx").on(t.stationId),
  ],
);

/**
 * Play-history from fm.atradio.actor.status updates (from Jetstream). The status
 * record is a singleton (rkey `self`) overwritten on each play, so each update
 * yields one history row here, keyed by (did, playedAt).
 */
export const recentlyPlayed = pgTable(
  "recently_played",
  {
    did: text("did").notNull(),
    stationId: text("station_id").notNull(),
    station: jsonb("station").$type<StationInfo>().notNull(),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.did, t.playedAt] }),
    index("recently_played_did_idx").on(t.did),
    index("recently_played_station_id_idx").on(t.stationId),
    index("recently_played_played_at_idx").on(t.playedAt),
  ],
);

/** Single-row resumable Jetstream cursor (max time_us seen). */
export const jetstreamCursor = pgTable("jetstream_cursor", {
  id: text("id").primaryKey(),
  timeUs: bigint("time_us", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
