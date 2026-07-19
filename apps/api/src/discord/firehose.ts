import { consola } from "consola";
import { env } from "../env";

/**
 * Forwards every Jetstream event to the Discord `#firehose` channel via an
 * incoming webhook. Fire-and-forget: Discord failures never block indexing.
 *
 * Events are batched and flushed on an interval so a burst of firehose traffic
 * can't blow past Discord's webhook rate limit (~5 requests / 2s per webhook).
 * Each flush packs as many events as fit into one message (Discord's 2000-char
 * content cap), so one HTTP call carries many events.
 */

/** Anything shaped like a Jetstream envelope — kept loose on purpose. */
interface FirehoseEvent {
  did: string;
  time_us: number;
  kind: string;
  commit?: {
    operation: string;
    collection: string;
    rkey: string;
  };
}

const FLUSH_INTERVAL_MS = 2000;
const DISCORD_CONTENT_LIMIT = 2000;
/** Cap the in-memory queue so a firehose spike can't grow it unbounded. */
const MAX_QUEUE = 5000;

const queue: string[] = [];
let timer: NodeJS.Timeout | null = null;
let dropped = 0;

/** One-line human summary of an event for the channel. */
function formatEvent(evt: FirehoseEvent): string {
  const c = evt.commit;
  if (evt.kind === "commit" && c) {
    return `\`${c.operation}\` **${c.collection}** \`${c.rkey}\` — \`${evt.did}\``;
  }
  return `\`${evt.kind}\` — \`${evt.did}\``;
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;

  // Pack lines into one message without exceeding Discord's content limit.
  const lines: string[] = [];
  let len = 0;
  while (queue.length > 0) {
    const next = queue[0];
    // +1 for the joining newline.
    if (len + next.length + 1 > DISCORD_CONTENT_LIMIT) break;
    lines.push(queue.shift()!);
    len += next.length + 1;
  }

  const content = lines.join("\n");
  try {
    const res = await fetch(env.DISCORD_FIREHOSE_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (res.status === 429) {
      // Rate limited: put these lines back and let the next tick retry.
      queue.unshift(...lines);
      const retryAfter = Number(res.headers.get("retry-after") ?? "1");
      consola.warn(`[firehose] Discord rate limited; retrying in ${retryAfter}s`);
    } else if (!res.ok) {
      consola.warn(`[firehose] Discord webhook responded ${res.status}`);
    }
  } catch (err) {
    consola.warn("[firehose] failed to post to Discord", err);
  }
}

/**
 * Queue a single Jetstream event for delivery to the `#firehose` channel.
 * No-op when the webhook URL is unset, so the consumer runs fine without it.
 */
export function forwardToFirehose(evt: FirehoseEvent): void {
  if (!env.DISCORD_FIREHOSE_WEBHOOK_URL) return;

  if (queue.length >= MAX_QUEUE) {
    dropped++;
    if (dropped % 1000 === 1) {
      consola.warn(`[firehose] queue full; dropped ${dropped} events so far`);
    }
    return;
  }
  queue.push(formatEvent(evt));

  if (!timer) {
    timer = setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);
    // Don't keep the process alive just for the flush timer.
    timer.unref?.();
  }
}
