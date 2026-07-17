import { atom } from "jotai";
import type { DeviceInfo } from "@/lib/connect/protocol";
import { getConnectClient } from "@/lib/connect/client";
import { liteToStation, stationToLite } from "@/lib/connect/device";
import {
  currentStationAtom,
  isPlayingAtom,
  playbackStatusAtom,
} from "./player";

export type ConnectStatus = "connecting" | "online" | "offline";

/** Live roster of this account's connected devices (self flagged). */
export const devicesAtom = atom<DeviceInfo[]>([]);

/** WebSocket status to the Connect hub. */
export const connectStatusAtom = atom<ConnectStatus>("offline");

/**
 * Set when the hub rejects our identity or token minting keeps failing — the
 * OAuth session is stale/expired and the user must sign in again. Cleared when a
 * fresh session rebuilds the Connect client.
 */
export const connectAuthErrorAtom = atom(false);

/** This browser's device id, once the hub has acknowledged it. */
export const selfDeviceIdAtom = atom<string | null>(null);

/**
 * The remote device this client is currently controlling, or null when this
 * device is the active player. Not persisted — resets each session.
 */
export const remoteTargetIdAtom = atom<string | null>(null);

/** Devices other than this one — what the picker lists as remote targets. */
export const otherDevicesAtom = atom((get) =>
  get(devicesAtom).filter((d) => !d.self),
);

/** The DeviceInfo we're controlling, or null. Falls back to null if it dropped. */
export const remoteTargetAtom = atom<DeviceInfo | null>((get) => {
  const id = get(remoteTargetIdAtom);
  if (!id) return null;
  return get(devicesAtom).find((d) => d.id === id && !d.self) ?? null;
});

/** True when transport/station actions should be routed to a remote device. */
export const isRemoteActiveAtom = atom((get) => get(remoteTargetAtom) !== null);

/**
 * Choose the active playback device (Spotify-style transfer).
 * - `deviceId` set → control that remote; hand it whatever we're playing.
 * - `null` → become the active device; pull the remote's station back here.
 */
export const selectDeviceAtom = atom(
  null,
  (get, set, deviceId: string | null) => {
    const prev = get(remoteTargetIdAtom);
    const devices = get(devicesAtom);
    const client = getConnectClient();

    if (deviceId) {
      const station = get(currentStationAtom);
      const playing = get(isPlayingAtom);
      set(remoteTargetIdAtom, deviceId);
      set(isPlayingAtom, false); // silence local audio; the remote takes over
      if (station && playing && client) {
        client.command(deviceId, {
          action: "playStation",
          station: stationToLite(station),
        });
      }
      return;
    }

    // Back to "this device": pull playback from the remote we were controlling.
    const remoteDev = devices.find((d) => d.id === prev);
    set(remoteTargetIdAtom, null);
    if (remoteDev?.state.station) {
      set(currentStationAtom, liteToStation(remoteDev.state.station));
      set(isPlayingAtom, true);
      set(playbackStatusAtom, "loading");
      if (client && prev) client.command(prev, { action: "stop" });
    }
  },
);
