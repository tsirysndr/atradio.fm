/**
 * atradio Connect wire protocol (web copy). Mirrors
 * `apps/api/src/connect/protocol.ts` — keep in sync.
 */
export const CONNECT_LXM = "fm.atradio.connect";

export interface StationLite {
  id: string;
  name: string;
  url: string;
  favicon?: string;
}

export interface PlaybackState {
  playing: boolean;
  station: StationLite | null;
  title?: string;
  volume: number;
  muted: boolean;
}

export type Platform = "web" | "cli" | "other";

export interface DeviceInfo {
  id: string;
  name: string;
  platform: Platform;
  self?: boolean;
  state: PlaybackState;
}

export type Command =
  | { action: "playPause" }
  | { action: "play" }
  | { action: "pause" }
  | { action: "stop" }
  | { action: "setVolume"; value: number }
  | { action: "toggleMute" }
  | { action: "playStation"; station: StationLite };

export type ServerMsg =
  | { t: "welcome"; did: string; deviceId: string }
  | { t: "devices"; devices: DeviceInfo[] }
  | { t: "command"; from: string; cmd: Command }
  | { t: "presence"; anyPlaying: boolean; cleanup?: boolean }
  | { t: "error"; code: string; message: string };
