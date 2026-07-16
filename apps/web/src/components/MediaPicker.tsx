import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconSearch, IconX, IconMoodSmile } from "@tabler/icons-react";
import {
  KLIPY_ENABLED,
  KLIPY_TABS,
  searchMedia,
  type KlipyMediaType,
  type MediaResult,
} from "@/lib/api/klipy";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface MediaPickerProps {
  onSelect: (media: MediaResult) => void;
  onClose: () => void;
}

/** Klipy-powered GIF / sticker / clip / meme picker. */
export function MediaPicker({ onSelect, onClose }: MediaPickerProps) {
  const [type, setType] = useState<KlipyMediaType>("gifs");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 350);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["klipy", type, debounced],
    queryFn: () => searchMedia(type, debounced),
    enabled: KLIPY_ENABLED,
    staleTime: 60_000,
  });

  const results = data ?? [];

  return (
    <div className="flex w-full flex-col gap-2 max-sm:h-full max-sm:min-h-0">
      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {KLIPY_TABS.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setType(t.type)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                type === t.type
                  ? "bg-synth-pink/20 text-synth-pink"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close media picker"
          className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/50 hover:bg-white/5 hover:text-foreground"
        >
          <IconX size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-synth-panel px-2.5 focus-within:border-synth-cyan">
        <IconSearch size={14} className="text-foreground/40" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${type}…`}
          className="h-9 w-full bg-transparent text-sm text-foreground placeholder:text-foreground/30 focus:outline-none"
        />
      </div>

      {/* Grid */}
      <div className="grid h-[min(58vh,24rem)] grid-cols-3 content-start gap-1.5 overflow-y-auto max-sm:h-auto max-sm:flex-1">
        {!KLIPY_ENABLED ? (
          <div className="col-span-3 flex flex-col items-center gap-1 py-8 text-center text-xs text-foreground/50">
            <IconMoodSmile size={22} className="text-foreground/30" />
            Set <code className="text-synth-cyan">VITE_KLIPY_API_KEY</code> to
            enable GIFs.
          </div>
        ) : results.length === 0 ? (
          <div className="col-span-3 py-8 text-center text-xs text-foreground/40">
            {isFetching ? "Loading…" : "No results"}
          </div>
        ) : (
          results.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m)}
              className="aspect-square overflow-hidden rounded-lg border border-white/5 bg-synth-panel transition-transform hover:scale-[1.03] hover:border-synth-pink/50"
              title={m.alt}
            >
              {m.isVideo ? (
                <video
                  src={m.url}
                  poster={m.previewUrl}
                  className="h-full w-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={m.previewUrl ?? m.url}
                  alt={m.alt ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          ))
        )}
      </div>

      <p className="text-center text-[0.6rem] text-foreground/30">
        Powered by KLIPY
      </p>
    </div>
  );
}
