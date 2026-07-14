import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { Station } from "@/lib/types";

export type PlaybackStatus = "idle" | "loading" | "playing" | "error";

/** The station currently loaded into the player (null = nothing selected). */
export const currentStationAtom = atom<Station | null>(null);

/** Whether the user intends playback (drives play/pause, not actual buffering). */
export const isPlayingAtom = atom(false);

export const playbackStatusAtom = atom<PlaybackStatus>("idle");

/** Current ICY "now playing" track title, when the stream exposes it. */
export const nowPlayingAtom = atom<string | null>(null);

/** Technical stream info reported by the decoder (Rockbox engine). */
export interface StreamInfo {
  codec?: string;
  /** kbps */
  bitrate?: number;
  /** Hz */
  sampleRate?: number;
}

export const streamInfoAtom = atom<StreamInfo | null>(null);

export const volumeAtom = atomWithStorage<number>("atradio:volume", 0.8);
export const mutedAtom = atomWithStorage<boolean>("atradio:muted", false);

/** Select a station and start playing it. */
export const playStationAtom = atom(null, (_get, set, station: Station) => {
  set(currentStationAtom, station);
  set(isPlayingAtom, true);
  set(playbackStatusAtom, "loading");
});

export const togglePlayAtom = atom(null, (get, set) => {
  if (!get(currentStationAtom)) return;
  set(isPlayingAtom, !get(isPlayingAtom));
});
