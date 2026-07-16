/** Compact relative time, e.g. "now", "3m", "2h", "5d", or a short date. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 45) return "now";
  const mins = secs / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${Math.round(days)}d`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
