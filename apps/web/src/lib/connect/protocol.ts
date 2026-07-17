/**
 * atradio Connect wire protocol (web copy). Mirrors
 * `apps/api/src/connect/protocol.ts` — keep in sync.
 */
export const CONNECT_LXM = "fm.atradio.connect";

/**
 * Audience for remote-control service-auth tokens. This is a DID **service
 * reference** (bare DID + `#fragment`) — atproto's OAuth scope parser rejects a
 * bare DID for `rpc:` audiences, so the fragment is required. Must match the
 * API's `CONNECT_SERVICE_AUD` (`apps/api/src/env.ts`). Used both in the
 * requested OAuth scope and as the `aud` passed to `getServiceAuth`.
 */
export const CONNECT_SERVICE_AUD = "did:web:api.atradio.fm#atradio_appview";

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
