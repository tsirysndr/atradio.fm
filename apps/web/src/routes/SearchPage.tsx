import { useSetAtom } from "jotai";
import { IconSearch } from "@tabler/icons-react";
import { CategoryGrid } from "@/components/CategoryGrid";
import { RecentlyPlayedRow } from "@/components/RecentlyPlayedRow";
import { openSearchPaletteAtom } from "@/atoms/ui";

export function SearchPage() {
  const openSearch = useSetAtom(openSearchPaletteAtom);

  return (
    <div className="flex w-full min-w-0 flex-col gap-8">
      <section className="flex flex-col items-center gap-3 pt-2 text-center sm:gap-4 sm:pt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          <span className="text-foreground">Social radio, made yours.</span>
        </h1>
        <p className="max-w-xl text-xs text-foreground/60 sm:text-sm">
          atradio.fm is a social internet radio platform built on{" "}
          <a
            href="https://atproto.com"
            target="_blank"
            rel="noreferrer"
            className="text-synth-cyan underline decoration-dotted underline-offset-2 hover:text-synth-pink"
          >
            AT Protocol
          </a>
          . Save, organize, discover, and listen to stations with your own{" "}
          <a
            href="https://atproto.com/guides/overview#identity"
            target="_blank"
            rel="noreferrer"
            className="text-synth-cyan underline decoration-dotted underline-offset-2 hover:text-synth-pink"
          >
            portable account
          </a>
          .
        </p>

        {/* Opens the quick-search palette — search lives entirely in the modal. */}
        <button
          type="button"
          onClick={() => openSearch()}
          aria-label="Search stations"
          className="mt-2 flex w-full max-w-2xl items-center gap-3 rounded-full border border-white/15 bg-synth-surface/60 px-5 py-3 text-left transition-colors hover:border-synth-cyan/60"
        >
          <IconSearch size={20} className="text-foreground/40" />
          <span className="flex-1 text-base text-foreground/30">
            Search stations, genres…
          </span>
          <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-xs text-foreground/50">
            /
          </kbd>
        </button>
      </section>

      <RecentlyPlayedRow />

      <CategoryGrid />
    </div>
  );
}
