import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { useSetAtom } from "jotai";
import {
  IconBrandBluesky,
  IconBrandDiscord,
  IconTerminal2,
} from "@tabler/icons-react";
import { cliInstallOpenAtom } from "@/atoms/ui";
import { IconTangled } from "./IconTangled";
import { LanguageSwitcher } from "./LanguageSwitcher";

const iconLinkBase =
  "flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:text-foreground";

export function Footer() {
  const { t } = useTranslation(["footer", "navbar"]);
  const openCliInstall = useSetAtom(cliInstallOpenAtom);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-10 border-t border-white/10 bg-synth-bg/60 sm:mt-16">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-6 text-center text-xs text-foreground/50 sm:flex-row sm:justify-between sm:gap-3 sm:text-left sm:text-sm">
        <p className="text-balance leading-relaxed">
          {t("copyright", { year })} ·{" "}
          <Trans
            t={t}
            i18nKey="tagline"
            components={{
              heart: (
                <span className="text-synth-pink" aria-label="love" role="img">
                  ❤️
                </span>
              ),
            }}
          />
        </p>

        <nav className="flex flex-wrap items-center justify-center gap-1">
          <Link to="/privacy" className="mr-2 inline-flex min-h-11 items-center px-2 text-foreground/70 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">
            {t("privacyPolicy")}
          </Link>
          {/* CLI only appears here on mobile; on desktop it lives in the
              topbar (Navbar). */}
          <button
            type="button"
            onClick={() => openCliInstall(true)}
            className={`${iconLinkBase} sm:hidden`}
            title={t("getCli", { ns: "navbar" })}
            aria-label={t("getCli", { ns: "navbar" })}
          >
            <IconTerminal2 size={18} />
          </button>

          <a
            href="https://bsky.app/profile/atradio.fm"
            target="_blank"
            rel="noreferrer"
            className={iconLinkBase}
            title="atradio.fm on Bluesky"
            aria-label="atradio.fm on Bluesky"
          >
            <IconBrandBluesky size={18} />
          </a>

          <a
            href="https://discord.gg/WA9hq9Tmkz"
            target="_blank"
            rel="noreferrer"
            className={iconLinkBase}
            title="atradio.fm on Discord"
            aria-label="atradio.fm on Discord"
          >
            <IconBrandDiscord size={18} />
          </a>

          <a
            href="https://tangled.org/atradio.fm/atradio"
            target="_blank"
            rel="noreferrer"
            className={iconLinkBase}
            title="atradio.fm on Tangled"
            aria-label="atradio.fm on Tangled"
          >
            <IconTangled size={18} />
          </a>

          {/* Language switcher only appears here on mobile; on desktop it
              lives in the topbar (Navbar). */}
          <div className="sm:hidden">
            <LanguageSwitcher menuPlacement="top" />
          </div>
        </nav>
      </div>
    </footer>
  );
}
