import { Link } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";
import {
  IconSearch,
  IconPlus,
  IconLogin2,
  IconUserCircle,
  IconBrandBluesky,
  IconBrandDiscord,
  IconTerminal2,
} from "@tabler/icons-react";
import {
  addStationOpenAtom,
  cliInstallOpenAtom,
  openSearchPaletteAtom,
} from "@/atoms/ui";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "./NotificationBell";
import { DevicePicker } from "./DevicePicker";
import { IconTangled } from "./IconTangled";
import { LanguageSwitcher } from "./LanguageSwitcher";

const navLinkBase =
  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-foreground/60 transition-colors hover:text-foreground";

// Hidden on the crowded mobile navbar; shown from `sm` up.
const iconLinkBase =
  "hidden h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:text-foreground sm:flex";

export function Navbar() {
  const { t } = useTranslation("navbar");
  const openAddStation = useSetAtom(addStationOpenAtom);
  const openCliInstall = useSetAtom(cliInstallOpenAtom);
  const openSearch = useSetAtom(openSearchPaletteAtom);
  const ensureAuth = useRequireAuth();
  const { isLoggedIn, profile, openLogin } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-synth-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="synth-gradient-text font-display text-xl font-bold tracking-tight">
            atradio.fm
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openSearch()}
            className={navLinkBase}
          >
            <IconSearch size={16} />
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              {t("searchShortcut")}
              <kbd className="rounded border border-white/15 bg-white/5 px-1 text-[10px] leading-relaxed text-foreground/50">
                /
              </kbd>
            </span>
          </button>

          {/* CLI lives in the topbar on desktop and moves to the footer on
              mobile (iconLinkBase is hidden below sm; the footer button is
              sm:hidden). */}
          <button
            type="button"
            onClick={() => openCliInstall(true)}
            className={iconLinkBase}
            title={t("getCli")}
            aria-label={t("getCli")}
          >
            <IconTerminal2 size={18} />
          </button>

          <a
            href="https://bsky.app/profile/atradio.fm"
            target="_blank"
            rel="noreferrer"
            className={iconLinkBase}
            title={t("onBluesky")}
            aria-label={t("onBluesky")}
          >
            <IconBrandBluesky size={18} />
          </a>

          <a
            href="https://discord.gg/WA9hq9Tmkz"
            target="_blank"
            rel="noreferrer"
            className={iconLinkBase}
            title={t("onDiscord")}
            aria-label={t("onDiscord")}
          >
            <IconBrandDiscord size={18} />
          </a>

          <a
            href="https://tangled.org/atradio.fm/atradio"
            target="_blank"
            rel="noreferrer"
            className={iconLinkBase}
            title={t("onTangled")}
            aria-label={t("onTangled")}
          >
            <IconTangled size={18} />
          </a>

          {/* Language switcher: topbar on desktop, footer on mobile. */}
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>

          <Button
            size="sm"
            variant="primary"
            className="gap-1.5 rounded-full"
            onPress={() => ensureAuth(() => openAddStation(true))}
          >
            <IconPlus size={16} />
            <span className="hidden sm:inline">{t("addStation", { ns: "common" })}</span>
            <span className="sm:hidden">{t("add", { ns: "common" })}</span>
          </Button>

          {/* Connect / notifications / profile move to the mobile bottom tab
              bar (as full-screen routes); on desktop they stay here. */}
          {isLoggedIn && (
            <div className="hidden sm:block">
              <DevicePicker />
            </div>
          )}
          {isLoggedIn && (
            <div className="hidden sm:block">
              <NotificationBell />
            </div>
          )}

          {isLoggedIn ? (
            <Link
              to="/profile"
              className="ml-1 hidden h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-synth-panel sm:flex"
              title={t("yourProfile")}
            >
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.handle}
                  className="h-full w-full object-cover"
                />
              ) : (
                <IconUserCircle size={20} className="text-foreground/70" />
              )}
            </Link>
          ) : (
            <Button
              size="sm"
              variant="tertiary"
              className="ml-1 hidden gap-1.5 rounded-full !bg-white/5 sm:inline-flex"
              onPress={() => openLogin(true)}
            >
              <IconLogin2 size={16} />
              <span className="hidden sm:inline">{t("signIn", { ns: "common" })}</span>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
