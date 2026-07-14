import { useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  currentStationAtom,
  togglePlayAtom,
  mutedAtom,
  volumeAtom,
} from "@/atoms/player";
import { toggleFavoriteAtom } from "@/atoms/favorites";
import { isLoggedInAtom } from "@/atoms/auth";
import {
  addStationOpenAtom,
  audioSettingsOpenAtom,
  shortcutsOpenAtom,
  openSearchPaletteAtom,
  loginModalOpenAtom,
} from "@/atoms/ui";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Global keyboard shortcuts. Mounted once from the app layout. */
export function useKeyboardShortcuts() {
  const currentStation = useAtomValue(currentStationAtom);
  const togglePlay = useSetAtom(togglePlayAtom);
  const toggleFavorite = useSetAtom(toggleFavoriteAtom);
  const [muted, setMuted] = useAtom(mutedAtom);
  const setVolume = useSetAtom(volumeAtom);
  const setAddOpen = useSetAtom(addStationOpenAtom);
  const setAudioSettingsOpen = useSetAtom(audioSettingsOpenAtom);
  const openSearch = useSetAtom(openSearchPaletteAtom);
  const openLogin = useSetAtom(loginModalOpenAtom);
  const isLoggedIn = useAtomValue(isLoggedInAtom);
  const [shortcutsOpen, setShortcutsOpen] = useAtom(shortcutsOpenAtom);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Let modifier combos (copy/paste, devtools, etc.) pass through.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const typing = isTypingTarget(e.target);

      // Escape works everywhere: blur inputs, close the help overlay.
      if (e.key === "Escape") {
        if (typing && e.target instanceof HTMLElement) e.target.blur();
        if (shortcutsOpen) setShortcutsOpen(false);
        return;
      }

      // While typing, only "/" is special-cased away (so slashes still type).
      if (typing) return;

      switch (e.key) {
        case "/": {
          e.preventDefault();
          // Search lives entirely in the quick-search palette.
          openSearch();
          break;
        }
        case " ":
        case "k":
        case "K":
          if (currentStation) {
            e.preventDefault();
            togglePlay();
          }
          break;
        case "m":
        case "M":
          setMuted((v) => !v);
          break;
        case "f":
        case "F":
          if (currentStation) {
            if (isLoggedIn) toggleFavorite(currentStation);
            else openLogin(true);
          }
          break;
        case "a":
        case "A":
          e.preventDefault();
          if (isLoggedIn) setAddOpen(true);
          else openLogin(true);
          break;
        case "e":
        case "E":
          setAudioSettingsOpen((v) => !v);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((v) => clamp(v + 0.05));
          if (muted) setMuted(false);
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((v) => clamp(v - 0.05));
          break;
        case "?":
          setShortcutsOpen((v) => !v);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentStation,
    togglePlay,
    toggleFavorite,
    setMuted,
    muted,
    setVolume,
    setAddOpen,
    setAudioSettingsOpen,
    openSearch,
    openLogin,
    isLoggedIn,
    shortcutsOpen,
    setShortcutsOpen,
  ]);
}
