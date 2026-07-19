import {
  NSID,
  actorStatusRecordSchema,
  commentRecordSchema,
  favoriteRecordSchema,
  reactionRecordSchema,
  stationRecordSchema,
  type ActorInfo,
  type StationInfo,
} from "@atradio/lexicons";
import type { DiscordEmbed } from "./firehose";

const WEB_ORIGIN = "https://atradio.fm";

/** Per-collection accent colour for the embed's left bar. */
const COLORS = {
  favorite: 0xf5a623, // gold
  station: 0x9b5de5, // violet
  status: 0x00f5d4, // teal
  comment: 0x00bbf9, // sky
  reaction: 0xf15bb5, // pink
  delete: 0x6c757d, // grey
} as const;

/** Escape Discord markdown so record text can't break the embed layout. */
function esc(s: string): string {
  return s.replace(/[*_~`>\\|]/g, "\\$&");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function profileUrl(actor: ActorInfo): string {
  return `${WEB_ORIGIN}/profile/${encodeURIComponent(actor.handle ?? actor.did)}`;
}

/** Prefer a real https logo; Discord ignores anything else. */
function httpUrl(url: string | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/** Author block: avatar + display name linking to the atradio profile. */
function authorOf(actor: ActorInfo): DiscordEmbed["author"] {
  return {
    name: actor.displayName || actor.handle || actor.did,
    url: profileUrl(actor),
    icon_url: httpUrl(actor.avatar),
  };
}

function footerOf(actor: ActorInfo): DiscordEmbed["footer"] {
  const handle = actor.handle ? `@${actor.handle}` : actor.did;
  return { text: `atradio.fm • ${handle}` };
}

/** A markdown link to the station: its homepage if set, else the app. */
function stationLink(station: StationInfo): string {
  const url = httpUrl(station.homepage) ?? WEB_ORIGIN;
  return `[${esc(station.name)}](${url})`;
}

/** Small "· genre · country" suffix, omitting empty parts. */
function stationMeta(station: StationInfo): string {
  const parts = [station.genre, station.country].filter(Boolean).map((p) => esc(p!));
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

interface Commit {
  operation: string;
  collection: string;
  rkey: string;
  record?: unknown;
}

/**
 * Build a Discord embed for one `fm.atradio.*` commit. Returns null for records
 * that fail validation (so we never post garbage). Deletes have no record and
 * get a minimal "removed" embed.
 */
export function buildFirehoseEmbed(c: Commit, actor: ActorInfo): DiscordEmbed | null {
  const base = {
    author: authorOf(actor),
    footer: footerOf(actor),
  };

  if (c.operation === "delete") {
    const kind = c.collection.replace("fm.atradio.", "");
    return {
      ...base,
      color: COLORS.delete,
      description: `🗑️ removed a **${esc(kind)}** record \`${esc(c.rkey)}\``,
    };
  }

  switch (c.collection) {
    case NSID.favorite: {
      const p = favoriteRecordSchema.safeParse(c.record);
      if (!p.success) return null;
      const s = p.data.station;
      return {
        ...base,
        color: COLORS.favorite,
        description: `⭐ favorited ${stationLink(s)}${stationMeta(s)}`,
        thumbnail: httpUrl(s.logo) ? { url: s.logo! } : undefined,
        timestamp: p.data.createdAt,
      };
    }

    case NSID.station: {
      const p = stationRecordSchema.safeParse(c.record);
      if (!p.success) return null;
      const r = p.data;
      const verb = c.operation === "update" ? "updated" : "created";
      const link = httpUrl(r.homepage) ?? WEB_ORIGIN;
      return {
        ...base,
        color: COLORS.station,
        description:
          `📻 ${verb} the station [${esc(r.name)}](${link})` +
          (r.genre ? ` · ${esc(r.genre)}` : ""),
        thumbnail: httpUrl(r.logo) ? { url: r.logo! } : undefined,
        timestamp: r.createdAt,
      };
    }

    case NSID.actorStatus: {
      const p = actorStatusRecordSchema.safeParse(c.record);
      if (!p.success) return null;
      const s = p.data.station;
      return {
        ...base,
        color: COLORS.status,
        description: `🎧 now listening to ${stationLink(s)}${stationMeta(s)}`,
        thumbnail: httpUrl(s.logo) ? { url: s.logo! } : undefined,
        timestamp: p.data.playedAt,
      };
    }

    case NSID.comment: {
      const p = commentRecordSchema.safeParse(c.record);
      if (!p.success) return null;
      const r = p.data;
      const body = r.text ? truncate(esc(r.text), 1500) : "";
      const gif = r.gif ? `\n${httpUrl(r.gif.url) ?? ""}` : "";
      return {
        ...base,
        color: COLORS.comment,
        description: `💬 commented on ${stationLink(r.station)}${body ? `\n\n${body}` : ""}${gif}`,
        thumbnail: httpUrl(r.station.logo) ? { url: r.station.logo! } : undefined,
        timestamp: r.createdAt,
      };
    }

    case NSID.reaction: {
      const p = reactionRecordSchema.safeParse(c.record);
      if (!p.success) return null;
      const r = p.data;
      return {
        ...base,
        color: COLORS.reaction,
        description: `${r.emoji} reacted on ${stationLink(r.station)}`,
        thumbnail: httpUrl(r.station.logo) ? { url: r.station.logo! } : undefined,
        timestamp: r.createdAt,
      };
    }

    default:
      return null;
  }
}
