import { IconBrandBluesky, IconBrandDiscord } from "@tabler/icons-react";
import { IconTangled } from "./IconTangled";

const iconLinkBase =
  "flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:text-foreground";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-synth-bg/60">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-6 text-sm text-foreground/50 sm:flex-row sm:justify-between sm:px-6">
        <p className="text-center sm:text-left">
          © {year} atradio.fm · Baked with{" "}
          <span className="text-synth-pink" aria-label="love" role="img">
            ❤️
          </span>{" "}
          in Antananarivo
        </p>

        <nav className="flex items-center gap-1">
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
        </nav>
      </div>
    </footer>
  );
}
