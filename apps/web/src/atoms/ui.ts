import { atom } from "jotai";

/** Controls the "Add your own station" modal, shared across navbar + profile. */
export const addStationOpenAtom = atom(false);

/** Controls the keyboard-shortcuts help overlay. */
export const shortcutsOpenAtom = atom(false);

/** Controls the Raycast-style quick-search palette. */
export const searchPaletteOpenAtom = atom(false);

/** Controls the AT Proto login modal. */
export const loginModalOpenAtom = atom(false);

/** Seed query for the palette (e.g. when opened from a category tile). */
export const searchPaletteQueryAtom = atom("");

/** Open the search palette, optionally pre-filled with a query. */
export const openSearchPaletteAtom = atom(
  null,
  (_get, set, term?: string) => {
    set(searchPaletteQueryAtom, term ?? "");
    set(searchPaletteOpenAtom, true);
  },
);
