import { atom } from "jotai";
import type { Station } from "@/lib/types";

/** Controls the "Add your own station" modal, shared across navbar + profile. */
export const addStationOpenAtom = atom(false);

/** Station whose comments modal is open (null = closed). */
export const commentsStationAtom = atom<Station | null>(null);

/** Controls the notifications dropdown in the topbar. */
export const notificationsOpenAtom = atom(false);

/** Controls the keyboard-shortcuts help overlay. */
export const shortcutsOpenAtom = atom(false);

/** Controls the Raycast-style quick-search palette. */
export const searchPaletteOpenAtom = atom(false);

/** Controls the AT Proto login modal. */
export const loginModalOpenAtom = atom(false);

/** Controls the advanced audio settings (EQ / DSP) modal. */
export const audioSettingsOpenAtom = atom(false);

/** Controls the "Install the CLI" modal opened from the topbar. */
export const cliInstallOpenAtom = atom(false);

/** Controls the fullscreen ("now playing") player view. */
export const playerFullscreenAtom = atom(false);

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
