import { Outlet } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { IconKeyboard } from "@tabler/icons-react";
import { currentStationAtom } from "@/atoms/player";
import { Navbar } from "./Navbar";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { PermissionBanner } from "./PermissionBanner";
import { Player } from "./Player";
import { ConnectBanner } from "./ConnectBanner";
import { ConnectProvider } from "./ConnectProvider";
import { PlayerReactionRain } from "./PlayerReactionRain";
import { AddStationModal } from "./AddStationModal";
import { CommentsModal } from "./CommentsModal";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { SearchPalette } from "./SearchPalette";
import { LoginModal } from "./LoginModal";
import { AudioSettingsModal } from "./AudioSettingsModal";
import { CliInstallModal } from "./CliInstallModal";
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
      {/* Reserve space for the fixed player bar and the mobile bottom tab bar.
          Mobile always needs room for the tab bar; the player sits above it. */}
      <div
        aria-hidden="true"
        className={station ? "pb-44 sm:pb-24" : "pb-20 sm:pb-0"}
      />

      {/* Keyboard shortcuts — desktop only (no keyboard on mobile, and the
          bottom tab bar owns that corner). */}
      <button
        type="button"
        aria-label={t("shortcutsButton")}
        title={t("shortcutsButtonTitle")}
        onClick={() => openShortcuts(true)}
        className={`fixed right-6 z-30 hidden h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-synth-panel/80 text-foreground/60 backdrop-blur transition-all hover:border-synth-cyan/60 hover:text-synth-cyan sm:flex ${
          station ? "bottom-28" : "bottom-6"
        }`}
      >
        <IconKeyboard size={18} />
      </button>

      <Player />
      <BottomNav />
      <ConnectBanner />
      <PlayerReactionRain />
      <AddStationModal />
      <CommentsModal />
      <ShortcutsHelp />
      <SearchPalette />
      <LoginModal />
      <AudioSettingsModal />
      <CliInstallModal />
      <AudioSettingsSync />
      <UserDataSync />
      <PlayStatusSync />
      <ConnectProvider />
    </div>
  );
}
