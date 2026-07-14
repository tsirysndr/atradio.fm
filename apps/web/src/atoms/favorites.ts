import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { Station } from "@/lib/types";

/**
 * Favorites are stored as full Station objects (not just ids) so the profile
 * page can render them without re-querying any provider — important since we
 * have no backend and TuneIn/radio-browser results aren't otherwise persisted.
 */
export const favoritesAtom = atomWithStorage<Station[]>(
  "atradio:favorites",
  [],
);

/** Set of favorited station ids, derived for O(1) membership checks. */
export const favoriteIdsAtom = atom((get) => {
  return new Set(get(favoritesAtom).map((s) => s.id));
});

export const toggleFavoriteAtom = atom(null, (get, set, station: Station) => {
  const current = get(favoritesAtom);
  const exists = current.some((s) => s.id === station.id);
  set(
    favoritesAtom,
    exists
      ? current.filter((s) => s.id !== station.id)
      : [station, ...current],
  );
});
