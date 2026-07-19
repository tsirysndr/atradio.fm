import { consola } from "consola";
import { env } from "../env";

/**
 * Transport for the Discord `#firehose` channel: queues rich embeds and flushes
 * them to an incoming webhook on an interval. Fire-and-forget — Discord failures
 * never block Jetstream indexing.
 *
 * Batching serves two purposes: it packs up to `EMBEDS_PER_MESSAGE` events into a
 * single HTTP call, and it keeps us under Discord's webhook rate limit (~5 req/2s)
 * even when the firehose bursts. Embeds are built by `./format`.
 */

export interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  timestamp?: string;
  author?: { name: string; url?: string; icon_url?: string };
  thumbnail?: { url: string };
  footer?: { text: string; icon_url?: string };
}

/** Discord allows at most 10 embeds per webhook message. */
const EMBEDS_PER_MESSAGE = 10;
const FLUSH_INTERVAL_MS = 2000;
/** Cap the in-memory queue so a firehose spike can't grow it unbounded. */
const MAX_QUEUE = 5000;

const queue: DiscordEmbed[] = [];
let timer: NodeJS.Timeout | null = null;
let dropped = 0;

/**
 * Cross-connection dedup. We subscribe to all four Jetstream hosts at once for
 * redundancy, so the same commit is delivered ~4×. Keyed by a host-stable record
 * identity (see `dedupeKey`), we post each record only once. Entries expire after
 * a short window — long enough to cover the gap between redundant deliveries.
 */
const DEDUP_TTL_MS = 5 * 60 * 1000;
const DEDUP_MAX = 20000;
/** key → expiry epoch ms; Map keeps insertion order for oldest-first eviction. */
const seen = new Map<string, number>();

/**
 * Returns true the FIRST time a record identity is seen (caller should forward),
 * false for subsequent redundant deliveries within the dedup window.
 */
export function claimFirstDelivery(key: string): boolean {
  const now = Date.now();
  const exp = seen.get(key);
  if (exp !== undefined && exp > now) return false;

  seen.set(key, now + DEDUP_TTL_MS);
  if (seen.size > DEDUP_MAX) {
    for (const [k, e] of seen) {
      if (e <= now) seen.delete(k);
    }
    // Still over budget after pruning expired? Drop oldest insertions.
    while (seen.size > DEDUP_MAX) {
      const oldest = seen.keys().next().value;
      if (oldest === undefined) break;
      seen.delete(oldest);
    }
  }
  return true;
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;

  const embeds = queue.splice(0, EMBEDS_PER_MESSAGE);
  try {
    const res = await fetch(env.DISCORD_FIREHOSE_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeds, allowed_mentions: { parse: [] } }),
    });
    if (res.status === 429) {
      // Rate limited: put these back at the front and let the next tick retry.
      queue.unshift(...embeds);
      const retryAfter = res.headers.get("retry-after") ?? "1";
      consola.warn(`[firehose] Discord rate limited; retrying in ${retryAfter}s`);
    } else if (!res.ok) {
      consola.warn(`[firehose] Discord webhook responded ${res.status}`);
    }
  } catch (err) {
    consola.warn("[firehose] failed to post to Discord", err);
  }
}

/**
 * Queue one embed for the `#firehose` channel. No-op when the webhook URL is
 * unset, so the consumer runs fine without Discord configured.
 */
export function enqueueFirehoseEmbed(embed: DiscordEmbed): void {
  if (!env.DISCORD_FIREHOSE_WEBHOOK_URL) return;

  if (queue.length >= MAX_QUEUE) {
    dropped++;
    if (dropped % 1000 === 1) {
      consola.warn(`[firehose] queue full; dropped ${dropped} events so far`);
    }
    return;
  }
  queue.push(embed);

  if (!timer) {
    timer = setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);
    // Don't keep the process alive just for the flush timer.
    timer.unref?.();
  }
}
