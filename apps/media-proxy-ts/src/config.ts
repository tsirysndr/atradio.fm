/** Runtime configuration, sourced from env vars with sane defaults. */

/** Default HTTP listen port when `PORT` is unset or not a valid integer. */
export const DEFAULT_PORT = 7081;

/** User-Agent sent to upstream stream/metadata hosts. */
export const UPSTREAM_USER_AGENT = "atradio.fm/1.0";

/** Per-IP request budget per window, and the window length in seconds. */
export const DEFAULT_RATE_LIMIT = 120;
export const DEFAULT_RATE_WINDOW = 60;

/** HTTP listen port. Read from `PORT`, falling back to {@link DEFAULT_PORT}. */
export function port(): number {
  return envInt("PORT", DEFAULT_PORT);
}

/** Max `/api/*` requests per IP per window (`RATE_LIMIT`, default 120). */
export function rateLimit(): number {
  return envInt("RATE_LIMIT", DEFAULT_RATE_LIMIT);
}

/** Rate-limit window length in seconds (`RATE_WINDOW`, default 60). */
export function rateWindow(): number {
  return envInt("RATE_WINDOW", DEFAULT_RATE_WINDOW);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  // Accept an all-integer string, else fall back to the default.
  const n = /^-?\d+$/.test(raw.trim()) ? Number.parseInt(raw, 10) : NaN;
  return Number.isNaN(n) ? fallback : n;
}
