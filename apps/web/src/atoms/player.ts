import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { Station } from "@/lib/types";
import { getConnectClient } from "@/lib/connect/client";
import { stationToLite } from "@/lib/connect/device";
import { remoteTargetIdAtom } from "./connect";

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

/**
 * Select a station and start playing it. When this client is controlling a
 * remote device, the station is sent there instead of played locally.
 */
export const playStationAtom = atom(null, (get, set, station: Station) => {
  const targetId = get(remoteTargetIdAtom);
  if (targetId) {
    getConnectClient()?.command(targetId, {
      action: "playStation",
      station: stationToLite(station),
    });
    return;
  }
  set(currentStationAtom, station);
  set(isPlayingAtom, true);
  set(playbackStatusAtom, "loading");
});

export const togglePlayAtom = atom(null, (get, set) => {
  const targetId = get(remoteTargetIdAtom);
  if (targetId) {
    getConnectClient()?.command(targetId, { action: "playPause" });
    return;
  }
  if (!get(currentStationAtom)) return;
  set(isPlayingAtom, !get(isPlayingAtom));
});
