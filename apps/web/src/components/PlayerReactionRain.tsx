import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAtomValue } from "jotai";
import type { LiveEvent } from "@atradio/lexicons";
import { currentStationAtom } from "@/atoms/player";
import { didAtom } from "@/atoms/auth";
import { useStationLive } from "@/hooks/useStationLive";
import { onReaction } from "@/lib/reactionBus";

interface Particle {
  id: number;
  emoji: string;
  /** horizontal start position, 0–100 (vw). */
  left: number;
  /** horizontal drift, px. */
  dx: number;
  /** rise duration, s. */
  dur: number;
  /** font size, rem. */
  size: number;
}

/**
 * Full-screen emoji rain for the player: every reaction — the local user's own
 * taps (instant, via the reaction bus) and other listeners' reactions (live over
 * SSE) — floats up from the bottom of the screen to the top in real time.
 * Rendered once globally; keyed to whatever station is currently playing.
 */
export function PlayerReactionRain() {
  const station = useAtomValue(currentStationAtom);
  const did = useAtomValue(didAtom);
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);
  // Latest station id for the (stable) bus subscription closure.
  const stationIdRef = useRef<string | null>(null);
  stationIdRef.current = station?.id ?? null;

  const spawn = (emoji: string) => {
    const id = ++idRef.current;
    const p: Particle = {
      id,
      emoji,
      left: 4 + Math.random() * 92,
      dx: (Math.random() * 2 - 1) * 120,
      dur: 3.6 + Math.random() * 2.4,
      size: 1.8 + Math.random() * 1.4,
    };
    setParticles((prev) => [...prev, p]);
    window.setTimeout(
      () => setParticles((prev) => prev.filter((x) => x.id !== id)),
      p.dur * 1000 + 150,
    );
  };

  // Own taps — instant, no round-trip.
  useEffect(
    () =>
      onReaction((sid, emoji) => {
        if (sid === stationIdRef.current) spawn(emoji);
      }),
    [],
  );

  // Other listeners' reactions — live over SSE (our own echo is skipped; the
  // bus already floated it).
  useStationLive(station?.id, (e: LiveEvent) => {
    if (e.type !== "reaction") return;
    if (e.actor.did === did) return;
    spawn(e.emoji);
  });

  if (!station) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[65] overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="reaction-particle absolute bottom-0 drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
          style={
            {
              left: `${p.left}%`,
              fontSize: `${p.size}rem`,
              lineHeight: 1,
              "--dx": `${p.dx}px`,
              "--dur": `${p.dur}s`,
              "--rise": "94vh",
            } as CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
