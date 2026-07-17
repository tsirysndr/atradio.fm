import type { Station } from "@/lib/types";
import type { PlaybackState, StationLite } from "./protocol";

/** Stable id for this browser (one per browser profile). */
export function getDeviceId(): string {
  const KEY = "atradio:deviceId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** A friendly device name from the user agent, e.g. "Chrome · macOS". */
export function getDeviceName(): string {
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua)
      ? "Edge"
      : /OPR\//.test(ua)
        ? "Opera"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const os = /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

/** Reduce a full Station to the minimal shape sent over the wire. */
export function stationToLite(s: Station): StationLite {
  return { id: s.id, name: s.name, url: s.streamUrl, favicon: s.favicon };
}

/** Reconstruct a playable Station from a wire StationLite (source from id). */
export function liteToStation(s: StationLite): Station {
  const source: Station["source"] = s.id.startsWith("tunein:")
    ? "tunein"
    : s.id.startsWith("custom:")
      ? "custom"
      : "radio-browser";
  return {
    id: s.id,
    name: s.name,
    streamUrl: s.url,
    favicon: s.favicon,
    source,
  };
}

/** Build the wire PlaybackState this device broadcasts to its peers. */
export function buildPlaybackState(opts: {
  station: Station | null;
  playing: boolean;
  title: string | null;
  volume: number;
  muted: boolean;
}): PlaybackState {
  return {
    playing: opts.playing && !!opts.station,
    station: opts.station ? stationToLite(opts.station) : null,
    title: opts.title ?? undefined,
    volume: opts.volume,
    muted: opts.muted,
  };
}
