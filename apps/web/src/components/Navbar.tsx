import { Link } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { Button } from "@heroui/react";
import { IconSearch, IconUser, IconPlus } from "@tabler/icons-react";
import { addStationOpenAtom, openSearchPaletteAtom } from "@/atoms/ui";

const navLinkBase =
  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-foreground/60 transition-colors hover:text-foreground";
const navLinkActive = "bg-white/10 !text-synth-cyan";

export function Navbar() {
  const openAddStation = useSetAtom(addStationOpenAtom);
  const openSearch = useSetAtom(openSearchPaletteAtom);

  const triggerSearch = () => openSearch();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-synth-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="synth-gradient-text font-display text-xl font-bold tracking-tight">
            atradio.fm
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <button type="button" onClick={triggerSearch} className={navLinkBase}>
            <IconSearch size={16} />
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              Search
              <kbd className="rounded border border-white/15 bg-white/5 px-1 text-[10px] leading-relaxed text-foreground/50">
                /
              </kbd>
            </span>
          </button>
          <Link
            to="/profile"
            className={navLinkBase}
            activeProps={{ className: navLinkActive }}
          >
            <IconUser size={16} />
            <span className="hidden sm:inline">Profile</span>
          </Link>

          <Button
            size="sm"
            variant="primary"
            className="ml-1 gap-1.5 rounded-full"
            onPress={() => openAddStation(true)}
          >
            <IconPlus size={16} />
            <span className="hidden sm:inline">Add station</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </nav>
      </div>
    </header>
  );
}
