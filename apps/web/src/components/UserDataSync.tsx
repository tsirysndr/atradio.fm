import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { consola } from "consola";
import { clientAtom, didAtom } from "@/atoms/auth";
import { setFavoritesAtom, clearFavoritesAtom } from "@/atoms/favorites";
import {
  setCustomStationsAtom,
  clearCustomStationsAtom,
} from "@/atoms/customStations";
import { listFavorites, listStations } from "@/lib/atproto/records";

/** Loads the logged-in user's favorites/stations from their PDS; renders nothing. */
export function UserDataSync() {
  const client = useAtomValue(clientAtom);
  const did = useAtomValue(didAtom);
  const setFavorites = useSetAtom(setFavoritesAtom);
  const setStations = useSetAtom(setCustomStationsAtom);
  const clearFavorites = useSetAtom(clearFavoritesAtom);
  const clearStations = useSetAtom(clearCustomStationsAtom);

  useEffect(() => {
    if (!client || !did) {
      clearFavorites();
      clearStations();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [favorites, stations] = await Promise.all([
          listFavorites(client, did),
          listStations(client, did),
        ]);
        if (cancelled) return;
        setFavorites(favorites);
        setStations(stations);
      } catch (err) {
        consola.error("[userdata] failed to load records", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    did,
    setFavorites,
    setStations,
    clearFavorites,
    clearStations,
  ]);

  return null;
}
