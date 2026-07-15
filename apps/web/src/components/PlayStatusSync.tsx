import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { consola } from "consola";
import { clientAtom, didAtom } from "@/atoms/auth";
import { currentStationAtom, playbackStatusAtom } from "@/atoms/player";
import { putActorStatus } from "@/lib/atproto/records";

/**
 * Publishes the logged-in user's listening status: whenever a station actually
 * reaches "on air", overwrite their fm.atradio.actor.status record with it.
 * Renders nothing.
 *
 * Keyed on the station id so pausing/resuming the same station doesn't rewrite;
 * a new record is written only when a different station starts playing.
 */
export function PlayStatusSync() {
  const client = useAtomValue(clientAtom);
  const did = useAtomValue(didAtom);
  const station = useAtomValue(currentStationAtom);
  const status = useAtomValue(playbackStatusAtom);

  /** Station id we last wrote a status record for. */
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!client || !did || !station || status !== "playing") return;
    if (lastWrittenRef.current === station.id) return;
    lastWrittenRef.current = station.id;
    void (async () => {
      try {
        await putActorStatus(client, did, station);
      } catch (err) {
        // Don't wedge on a transient failure — allow a later play to retry.
        lastWrittenRef.current = null;
        consola.error("[play-status] failed to write status record", err);
      }
    })();
  }, [client, did, station, status]);

  return null;
}
