import { useAtomValue, useSetAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconUserCircle,
  IconPlayerPlayFilled,
  IconHistory,
} from "@tabler/icons-react";
import { infoToStation, type PlayView } from "@atradio/lexicons";
import * as appview from "@/lib/appview";
import { currentStationAtom, playStationAtom } from "@/atoms/player";
import { StationLogo } from "./StationLogo";
import { AudioBars } from "./AudioBars";

/** Compact "3m ago" style relative time. */
function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function PlayCard({ item }: { item: PlayView }) {
  const play = useSetAtom(playStationAtom);
  const current = useAtomValue(currentStationAtom);
  const station = infoToStation(item.station);
  const isCurrent = current?.id === station.id;
  const actorId = item.actor?.handle ?? item.actor?.did;
  const actorName =
    item.actor?.displayName || item.actor?.handle || "someone";

  return (
    <div className="flex w-[220px] shrink-0 flex-col gap-3 rounded-xl border border-white/10 bg-synth-surface/70 p-4 backdrop-blur">
      <button
        type="button"
        onClick={() => play(station)}
        className="group flex items-start gap-3 text-left"
        aria-label={`Play ${station.name}`}
      >
        <div className="relative shrink-0">
          <StationLogo station={station} size={48} />
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <IconPlayerPlayFilled size={20} className="text-white" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3
              className="truncate font-display text-sm font-semibold text-foreground"
              title={station.name}
            >
              {station.name}
            </h3>
            {isCurrent && <AudioBars className="shrink-0" />}
          </div>
          {station.genre && (
            <p className="truncate text-xs text-synth-cyan/90">
              {station.genre}
            </p>
          )}
        </div>
      </button>

      <div className="mt-auto flex items-center gap-2 border-t border-white/5 pt-2">
        {actorId ? (
          <Link
            to="/profile/$actor"
            params={{ actor: actorId }}
            className="flex min-w-0 items-center gap-1.5 text-xs text-foreground/60 hover:text-synth-cyan"
            title={`Played by ${actorName}`}
          >
            {item.actor?.avatar ? (
              <img
                src={item.actor.avatar}
                alt=""
                className="h-4 w-4 shrink-0 rounded-full object-cover"
              />
            ) : (
              <IconUserCircle size={16} className="shrink-0" />
            )}
            <span className="truncate">{actorName}</span>
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-foreground/60">
            <IconUserCircle size={16} />
            {actorName}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[0.7rem] text-foreground/40">
          {timeAgo(item.playedAt)}
        </span>
      </div>
    </div>
  );
}

/**
 * Horizontal, scrollable row of what's been played across the platform lately —
 * station + the listener who played it + when. Hidden until data is available.
 */
export function RecentlyPlayedRow() {
  const { data } = useQuery({
    queryKey: ["global-recently-played"],
    queryFn: () => appview.getGlobalRecentlyPlayed({ limit: 20 }),
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <IconHistory size={18} className="text-synth-magenta" />
        Recently played on atradio.fm
      </h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, i) => (
          <PlayCard key={item.actor?.did ?? `${item.playedAt}-${i}`} item={item} />
        ))}
      </div>
    </section>
  );
}
