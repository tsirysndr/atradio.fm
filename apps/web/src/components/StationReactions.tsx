import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAtomValue } from "jotai";
import { consola } from "consola";
import { IconMoodSmile } from "@tabler/icons-react";
import type { Station } from "@/lib/types";
import { clientAtom, didAtom } from "@/atoms/auth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { putReaction } from "@/lib/atproto/records";
import { emitReaction } from "@/lib/reactionBus";

/** Quick-tap emojis offered on the player (music-forward). */
const QUICK_EMOJIS = [
  "❤️",
  "🔥",
  "🎶",
  "🎵",
  "🎧",
  "🎸",
  "🎹",
  "🥁",
  "🎤",
  "🕺",
  "💃",
  "🙌",
  "👏",
  "🤯",
  "😂",
];

interface StationReactionsProps {
  station: Station;
  /** `full` = larger trigger (fullscreen player). */
  variant?: "mini" | "full";
  className?: string;
}

/**
 * A smiley trigger that reveals an animated, magnifying (macOS-dock) emoji
 * picker on hover or click. The picker is portalled to <body> so an
 * `overflow-hidden` player card can't clip it. Tapping an emoji writes a
 * `fm.atradio.reaction` to the user's PDS (or opens login when signed out) and
 * announces it on the local reaction bus so the full-screen player rain floats
 * it up instantly. Reactions from other listeners arrive over live SSE.
 */
export function StationReactions({
  station,
  variant = "mini",
  className,
}: StationReactionsProps) {
  const client = useAtomValue(clientAtom);
  const did = useAtomValue(didAtom);
  const ensureAuth = useRequireAuth();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ cx: number; top: number } | null>(null);

  const triggerSize = variant === "full" ? "h-11 w-11" : "h-9 w-9";
  const iconSize = variant === "full" ? 24 : 20;

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  /** Measure the trigger so the portalled picker sits right above it. */
  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ cx: r.left + r.width / 2, top: r.top });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  const openNow = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    measure();
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  const react = (emoji: string) => {
    // Close the picker first so it can't cover the login modal when signed out.
    setOpen(false);
    ensureAuth(() => {
      if (!client || !did) return;
      // Instant local rain, then persist to the PDS.
      emitReaction(station.id, emoji);
      putReaction(client, did, station, emoji).catch((err) =>
        consola.error("[reactions] failed to post", err),
      );
    });
  };

  const picker =
    open && anchor
      ? createPortal(
          // Full-width, screen-centered so a wide row never runs off either
          // edge; lifted above the trigger. Single horizontal row that scrolls
          // on narrow screens (never wraps / grows vertically).
          <div
            className="pointer-events-auto fixed inset-x-0 z-[70] flex -translate-y-full justify-center px-3"
            style={{ top: anchor.top - 8 }}
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
          >
            <div className="emoji-pop-in no-scrollbar max-w-full overflow-x-auto rounded-full border border-white/10 bg-synth-surface/95 px-2.5 pb-2 pt-9 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <div
                onMouseLeave={() => setHovered(null)}
                className="mx-auto flex w-max items-end gap-0.5"
              >
                {QUICK_EMOJIS.map((emoji, i) => {
                  // Dock falloff: hovered = biggest, neighbors shrink by distance.
                  const dist = hovered === null ? 99 : Math.abs(i - hovered);
                  const scale =
                    dist === 0 ? 1.55 : dist === 1 ? 1.3 : dist === 2 ? 1.12 : 1;
                  const lift =
                    dist === 0 ? 8 : dist === 1 ? 4 : dist === 2 ? 1 : 0;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onMouseEnter={() => setHovered(i)}
                      onFocus={() => setHovered(i)}
                      onClick={() => react(emoji)}
                      aria-label={`React ${emoji}`}
                      style={{
                        transform: `translateY(-${lift}px) scale(${scale})`,
                        transition:
                          "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                      className="flex h-9 w-8 shrink-0 origin-bottom items-center justify-center text-2xl active:scale-110"
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`relative ${className ?? ""}`}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openNow())}
        aria-label="React with an emoji"
        aria-expanded={open}
        className={`flex ${triggerSize} items-center justify-center rounded-full transition-colors ${
          open
            ? "bg-synth-pink/15 text-synth-pink"
            : "text-foreground/70 hover:text-synth-pink"
        }`}
      >
        <IconMoodSmile size={iconSize} />
      </button>
      {picker}
    </div>
  );
}
