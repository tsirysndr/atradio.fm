import { atom } from "jotai";
import { consola } from "consola";
import type { Station } from "@/lib/types";
import { clientAtom, didAtom } from "./auth";
import {
  putFavorite,
  pruneFavoriteDuplicates,
  type StoredStation,
} from "@/lib/atproto/records";

/**
 * Favorites are the logged-in user's `fm.atradio.favorite` records, held in
 * memory (loaded from the PDS on login). Writes go straight to the PDS with an
 * optimistic local update.
 */
export const favoritesAtom = atom<Station[]>([]);

/** station.id -> record rkey, so we can delete the right record. */
export const favoriteRkeysAtom = atom<Record<string, string>>({});

/** Derived set of favorited station ids for O(1) membership checks. */
export const favoriteIdsAtom = atom(
  (get) => new Set(get(favoritesAtom).map((s) => s.id)),
);

/** Replace the favorites list (used by the on-login loader). Dedupes by station
 *  id so favorites left under old random keys don't show twice; the canonical
 *  (deterministic-key) record wins, and toggling the station later prunes the
 *  strays on the PDS. */
export const setFavoritesAtom = atom(
  null,
  (_get, set, items: StoredStation[]) => {
    const byId = new Map<string, StoredStation>();
    for (const i of items) {
      const prev = byId.get(i.station.id);
      // Prefer the canonical key (matches favoriteRkey(stationId)); else keep
      // the first seen.
      if (!prev) byId.set(i.station.id, i);
    }
    const unique = [...byId.values()];
    set(
      favoritesAtom,
      unique.map((i) => i.station),
    );
    set(
      favoriteRkeysAtom,
      Object.fromEntries(unique.map((i) => [i.station.id, i.rkey])),
    );
  },
);

export const clearFavoritesAtom = atom(null, (_get, set) => {
  set(favoritesAtom, []);
  set(favoriteRkeysAtom, {});
});

/** Toggle a favorite: optimistic local update + PDS write, rollback on error. */
export const toggleFavoriteAtom = atom(
  null,
  async (get, set, station: Station) => {
    const client = get(clientAtom);
    const did = get(didAtom);
    if (!client || !did) return; // gated at the UI; nothing to do

    const current = get(favoritesAtom);
    const rkeys = get(favoriteRkeysAtom);
    const exists = current.some((s) => s.id === station.id);

    if (exists) {
      set(
        favoritesAtom,
        current.filter((s) => s.id !== station.id),
      );
      const nextRkeys = { ...rkeys };
      delete nextRkeys[station.id];
      set(favoriteRkeysAtom, nextRkeys);
      try {
        // Delete every record for this station — canonical + any legacy dupes.
        await pruneFavoriteDuplicates(client, did, station.id);
      } catch (err) {
        consola.error("[favorites] remove failed", err);
        set(favoritesAtom, current);
        set(favoriteRkeysAtom, rkeys);
      }
    } else {
      set(favoritesAtom, [station, ...current]);
      try {
        const rkey = await putFavorite(client, did, station);
        set(favoriteRkeysAtom, {
          ...get(favoriteRkeysAtom),
          [station.id]: rkey,
        });
        // Fold any favorites left under old random keys into the canonical one.
        await pruneFavoriteDuplicates(client, did, station.id, rkey);
      } catch (err) {
        consola.error("[favorites] add failed", err);
        set(favoritesAtom, current);
      }
    }
  },
);
