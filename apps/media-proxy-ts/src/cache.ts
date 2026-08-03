/**
 * A tiny per-node TTL cache for TuneIn + ICY responses. Node-local by design —
 * the proxy is stateless and scales horizontally, so no Redis.
 */

interface Entry {
  value: string;
  expiry: number; // ms epoch
}

const table = new Map<string, Entry>();

/** Fetch a live (non-expired) entry, or `null` if absent/expired. */
export function get(key: string): string | null {
  const entry = table.get(key);
  if (entry === undefined) return null;
  if (entry.expiry <= Date.now()) {
    table.delete(key);
    return null;
  }
  return entry.value;
}

/** Store `value` under `key` for `ttlSeconds`. */
export function set(key: string, value: string, ttlSeconds: number): void {
  table.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
}
