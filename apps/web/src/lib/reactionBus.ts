/**
 * Tiny in-app event bus for emoji reactions the local user just tapped. The
 * full-screen player rain listens to this for instant feedback (no PDS →
 * Jetstream → SSE round-trip), while reactions from *other* listeners still
 * arrive over the live SSE stream.
 */
type ReactionHandler = (stationId: string, emoji: string) => void;

const handlers = new Set<ReactionHandler>();

/** Announce a locally-tapped reaction so the rain can float it immediately. */
export function emitReaction(stationId: string, emoji: string): void {
  for (const h of handlers) h(stationId, emoji);
}

/** Subscribe to locally-tapped reactions; returns an unsubscribe function. */
export function onReaction(handler: ReactionHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
