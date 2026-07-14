import { atom } from "jotai";
import { consola } from "consola";
import { NSID } from "@atradio/lexicons";
import type { Station } from "@/lib/types";
import { clientAtom, didAtom } from "./auth";
import {
  putFavorite,
  deleteAtradioRecord,
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

/** Replace the favorites list (used by the on-login loader). */
export const setFavoritesAtom = atom(
  null,
  (_get, set, items: StoredStation[]) => {
    set(
      favoritesAtom,
      items.map((i) => i.station),
    );
    set(
      favoriteRkeysAtom,
      Object.fromEntries(items.map((i) => [i.station.id, i.rkey])),
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
      const rkey = rkeys[station.id];
      set(
        favoritesAtom,
        current.filter((s) => s.id !== station.id),
      );
      const nextRkeys = { ...rkeys };
      delete nextRkeys[station.id];
      set(favoriteRkeysAtom, nextRkeys);
      try {
        if (rkey) await deleteAtradioRecord(client, did, NSID.favorite, rkey);
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
      } catch (err) {
        consola.error("[favorites] add failed", err);
        set(favoritesAtom, current);
      }
    }
  },
);
