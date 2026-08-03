/**
 * Per-node fixed-window rate limiter. Node-local, like the cache: behind a load
 * balancer the effective limit is (replicas x limit), which is fine for basic
 * abuse protection. A background sweep drops expired windows so the map stays
 * bounded.
 */

export type Decision =
  | { kind: "allowed"; remaining: number }
  | { kind: "limited"; retryAfter: number };

const SWEEP_MS = 120_000;

// key: `${clientKey}:${windowEnd}` -> count in that window.
const counters = new Map<string, number>();

let sweeper: ReturnType<typeof setInterval> | undefined;

/** Start the background sweeper. Call once at startup. */
export function init(): void {
  if (sweeper !== undefined) return;
  sweeper = setInterval(sweep, SWEEP_MS);
  // Don't keep the process alive just for the sweep.
  sweeper.unref?.();
}

/** Count one request for `key` in the current window. */
export function check(key: string, limit: number, windowSeconds: number): Decision {
  const now = Math.floor(Date.now() / 1000);
  const windowEnd = (Math.floor(now / windowSeconds) + 1) * windowSeconds;
  const slot = `${key}:${windowEnd}`;
  const count = (counters.get(slot) ?? 0) + 1;
  counters.set(slot, count);
  if (count <= limit) return { kind: "allowed", remaining: limit - count };
  return { kind: "limited", retryAfter: windowEnd - now };
}

/** Drop entries whose window has already ended. */
function sweep(): void {
  const now = Math.floor(Date.now() / 1000);
  for (const slot of counters.keys()) {
    const windowEnd = Number(slot.slice(slot.lastIndexOf(":") + 1));
    if (windowEnd < now) counters.delete(slot);
  }
}
