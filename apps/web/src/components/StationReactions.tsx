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
  const pillRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ cx: number; top: number } | null>(null);
  /** Clamped screen-x for the picker's center (keeps it on-screen). */
  const [pickerLeft, setPickerLeft] = useState<number | null>(null);

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

  // Center the picker on the trigger, but clamp so it never runs off either
  // screen edge (a wide row anchored to an edge button would otherwise overflow).
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const w = pillRef.current?.offsetWidth ?? 0;
    const margin = 8;
    const half = w / 2;
    const vw = window.innerWidth;
    setPickerLeft(
      Math.max(margin + half, Math.min(anchor.cx, vw - margin - half)),
    );
  }, [open, anchor, hovered]);

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
          // Centered on the trigger (clamped on-screen), lifted above it. Single
          // horizontal row; scrolls on narrow screens (never wraps).
          <div
            className="pointer-events-auto fixed z-[70] -translate-x-1/2 -translate-y-full"
            style={{ left: pickerLeft ?? anchor.cx, top: anchor.top - 10 }}
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
          >
            <div
              ref={pillRef}
              onMouseLeave={() => setHovered(null)}
              // Symmetric top/bottom padding keeps the resting row vertically
              // centered; the generous top room lets a magnified emoji pop up
              // (macOS-dock style) without being clipped by the x-scroll.
              className="emoji-pop-in no-scrollbar flex max-w-[calc(100vw-1rem)] items-center gap-0.5 overflow-x-auto rounded-3xl border border-white/10 bg-synth-surface/95 px-3 py-7 shadow-2xl shadow-black/60 backdrop-blur-xl"
            >
              {QUICK_EMOJIS.map((emoji, i) => {
                // Dock falloff: hovered = biggest, neighbors shrink by distance.
                const dist = hovered === null ? 99 : Math.abs(i - hovered);
                const scale =
                  dist === 0 ? 1.6 : dist === 1 ? 1.32 : dist === 2 ? 1.12 : 1;
                const lift = dist === 0 ? 6 : dist === 1 ? 3 : dist === 2 ? 1 : 0;
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
                      transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                    className="flex h-9 w-8 shrink-0 origin-bottom items-center justify-center text-2xl active:scale-110"
                  >
                    {emoji}
                  </button>
                );
              })}
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
