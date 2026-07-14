import { Outlet } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { IconKeyboard } from "@tabler/icons-react";
import { Navbar } from "./Navbar";
import { Player } from "./Player";
import { AddStationModal } from "./AddStationModal";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { SearchPalette } from "./SearchPalette";
import { LoginModal } from "./LoginModal";
import { AudioSettingsModal } from "./AudioSettingsModal";
import { AudioSettingsSync } from "./AudioSettingsSync";
import { UserDataSync } from "./UserDataSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { shortcutsOpenAtom } from "@/atoms/ui";

export function Layout() {
  useKeyboardShortcuts();
  const openShortcuts = useSetAtom(shortcutsOpenAtom);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-36 pt-8 sm:px-6">
        <Outlet />
      </main>

      <button
        type="button"
        aria-label="Show keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        onClick={() => openShortcuts(true)}
        className="fixed bottom-24 right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-synth-panel/80 text-foreground/60 backdrop-blur transition-colors hover:border-synth-cyan/60 hover:text-synth-cyan sm:bottom-6 sm:right-6"
      >
        <IconKeyboard size={18} />
      </button>

      <Player />
      <AddStationModal />
      <ShortcutsHelp />
      <SearchPalette />
      <LoginModal />
      <AudioSettingsModal />
      <AudioSettingsSync />
      <UserDataSync />
    </div>
  );
}
