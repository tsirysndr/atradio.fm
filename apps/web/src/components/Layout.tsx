import { Outlet } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { IconKeyboard } from "@tabler/icons-react";
import { currentStationAtom } from "@/atoms/player";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { PermissionBanner } from "./PermissionBanner";
import { Player } from "./Player";
import { PlayerReactionRain } from "./PlayerReactionRain";
import { AddStationModal } from "./AddStationModal";
import { CommentsModal } from "./CommentsModal";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { SearchPalette } from "./SearchPalette";
import { LoginModal } from "./LoginModal";
import { AudioSettingsModal } from "./AudioSettingsModal";
import { AudioSettingsSync } from "./AudioSettingsSync";
import { UserDataSync } from "./UserDataSync";
import { PlayStatusSync } from "./PlayStatusSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { shortcutsOpenAtom } from "@/atoms/ui";

export function Layout() {
  const { t } = useTranslation("common");
  useKeyboardShortcuts();
  const openShortcuts = useSetAtom(shortcutsOpenAtom);
  const station = useAtomValue(currentStationAtom);

  return (
    <div className="flex min-h-screen flex-col">
      <PermissionBanner />
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-8 sm:px-6">
        <Outlet />
      </main>

      <Footer />
      <div className="pb-24" aria-hidden="true" />

      <button
        type="button"
        aria-label={t("shortcutsButton")}
        title={t("shortcutsButtonTitle")}
        onClick={() => openShortcuts(true)}
        className={`fixed right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-synth-panel/80 text-foreground/60 backdrop-blur transition-all hover:border-synth-cyan/60 hover:text-synth-cyan sm:right-6 ${
          station ? "bottom-28 sm:bottom-28" : "bottom-6 sm:bottom-6"
        }`}
      >
        <IconKeyboard size={18} />
      </button>

      <Player />
      <PlayerReactionRain />
      <AddStationModal />
      <CommentsModal />
      <ShortcutsHelp />
      <SearchPalette />
      <LoginModal />
      <AudioSettingsModal />
      <AudioSettingsSync />
      <UserDataSync />
      <PlayStatusSync />
    </div>
  );
}
