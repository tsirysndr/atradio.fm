import { useEffect, useRef } from "react";
import type { LiveEvent } from "@atradio/lexicons";
import { subscribeLive } from "@/lib/appview";

/**
 * Ref-counted registry of one SSE connection per station, so the player's
 * reaction overlay and an open comments panel share a single stream instead of
 * opening a socket each.
 */
interface Entry {
  close: () => void;
  handlers: Set<(e: LiveEvent) => void>;
}
const registry = new Map<string, Entry>();

function attach(stationId: string, handler: (e: LiveEvent) => void): () => void {
  let entry = registry.get(stationId);
  if (!entry) {
    const handlers = new Set<(e: LiveEvent) => void>();
    const close = subscribeLive(stationId, (e) => {
      for (const h of handlers) h(e);
    });
    entry = { close, handlers };
    registry.set(stationId, entry);
  }
  entry.handlers.add(handler);
  return () => {
    const en = registry.get(stationId);
    if (!en) return;
    en.handlers.delete(handler);
    if (en.handlers.size === 0) {
      en.close();
      registry.delete(stationId);
    }
  };
}

/** Subscribe to a station's live comment/reaction events for the hook's life. */
export function useStationLive(
  stationId: string | null | undefined,
  handler: (e: LiveEvent) => void,
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!stationId) return;
    return attach(stationId, (e) => ref.current(e));
  }, [stationId]);
}
