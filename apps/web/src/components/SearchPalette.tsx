import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Modal, useOverlayState } from "@heroui/react";
import {
  IconSearch,
  IconPlayerPlayFilled,
  IconCornerDownLeft,
  IconX,
} from "@tabler/icons-react";
import { searchPaletteOpenAtom, searchPaletteQueryAtom } from "@/atoms/ui";
import { customStationsAtom } from "@/atoms/customStations";
import { playStationAtom } from "@/atoms/player";
import { useStationSearch } from "@/hooks/useStationSearch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { Station } from "@/lib/types";
import { StationLogo } from "./StationLogo";
import { InlineLoader } from "./Skeletons";

const MAX_RESULTS = 12;

export function SearchPalette() {
  const { t } = useTranslation("search");
  const sourceLabel: Record<Station["source"], string> = {
    "radio-browser": "radio-browser",
    tunein: "TuneIn",
    custom: t("source.custom"),
  };
  const [isOpen, setOpen] = useAtom(searchPaletteOpenAtom);
  const seed = useAtomValue(searchPaletteQueryAtom);
  const state = useOverlayState({ isOpen, onOpenChange: setOpen });

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(query, 300);

  const customStations = useAtomValue(customStationsAtom);
  const play = useSetAtom(playStationAtom);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useStationSearch(debounced);

  const results = useMemo<Station[]>(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return [];
    const mine = customStations.filter((s) =>
      [s.name, s.genre, s.description].some((v) => v?.toLowerCase().includes(q)),
    );
    return [...mine, ...(data?.stations ?? [])].slice(0, MAX_RESULTS);
  }, [customStations, data?.stations, debounced]);

  // Seed + focus the field on open; clear on close.
  useEffect(() => {
    if (isOpen) {
      setQuery(seed);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    setQuery("");
    setActive(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const hasQuery = debounced.trim().length >= 2;

  const choose = (station: Station) => {
    play(station);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const station = results[active];
      if (station) choose(station);
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container placement="top" size="lg">
          <Modal.Dialog className="mx-4 mt-[8vh] w-[calc(100vw-2rem)] max-w-xl overflow-hidden border border-white/10 bg-overlay !p-0 shadow-2xl max-sm:!m-0 max-sm:!flex max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-screen max-sm:!max-w-none max-sm:!flex-col max-sm:!rounded-none">
            {/* Search field */}
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
              <IconSearch
                size={20}
                className={
                  isFetching
                    ? "animate-pulse text-synth-cyan"
                    : "text-foreground/40"
                }
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("placeholder")}
                className="w-full bg-transparent text-base text-foreground placeholder:text-foreground/30 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              {isFetching && <InlineLoader width={60} />}
              {/* Mobile close (no backdrop to tap when fullscreen). */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("closeAria")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/60 hover:bg-white/5 hover:text-foreground sm:hidden"
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="max-h-[52vh] overflow-y-auto p-2 max-sm:max-h-none max-sm:min-h-0 max-sm:flex-1"
            >
              {!hasQuery ? (
                <p className="px-3 py-8 text-center text-sm text-foreground/40">
                  {t("emptyHint")}
                </p>
              ) : results.length === 0 && !isFetching ? (
                <p className="px-3 py-8 text-center text-sm text-foreground/40">
                  {t("noResults", { query: debounced })}
                </p>
              ) : (
                results.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(s)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      active === i ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <StationLogo station={s} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {s.name}
                      </p>
                      <p className="truncate text-xs text-foreground/50">
                        {[s.genre, s.country, sourceLabel[s.source]]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {active === i && (
                      <IconPlayerPlayFilled
                        size={16}
                        className="shrink-0 text-synth-cyan"
                      />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2 text-[11px] text-foreground/40">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/15 bg-white/5 px-1">
                  ↑
                </kbd>
                <kbd className="rounded border border-white/15 bg-white/5 px-1">
                  ↓
                </kbd>
                {t("hints.navigate")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="flex items-center rounded border border-white/15 bg-white/5 px-1">
                  <IconCornerDownLeft size={11} />
                </kbd>
                {t("hints.play")}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/15 bg-white/5 px-1">
                  esc
                </kbd>
                {t("hints.close")}
              </span>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
