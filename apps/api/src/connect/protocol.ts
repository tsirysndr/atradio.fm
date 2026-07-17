/**
 * atradio Connect — the wire protocol shared by every client (web + CLI) and
 * the hub. Spotify-Connect-style remote control: each logged-in client opens a
 * WebSocket to `/connect`, is grouped by its account DID, and can list and
 * control the other devices on the same account.
 *
 * Frames are JSON text messages. The web and CLI keep their own copies of these
 * shapes (TypeScript / Rust); this file is the source of truth — keep them in
 * sync.
 *
 * The `lxm` (lexicon method) that clients bind their service-auth JWT to.
 */
export const CONNECT_LXM = "fm.atradio.connect";

/** A minimal station description — everything needed to start playback. */
export interface StationLite {
  id: string;
  name: string;
  /** The stream URL to play. */
  url: string;
  /** Station logo / favicon, if any. */
  favicon?: string;
}

/** A device's current playback snapshot, broadcast to its peers. */
export interface PlaybackState {
  playing: boolean;
  station: StationLite | null;
  /** ICY "now playing" title, when known. */
  title?: string;
  /** 0..1 */
  volume: number;
  muted: boolean;
}

export type Platform = "web" | "cli" | "other";

/** A device as seen in the roster. `self` is stamped per-recipient. */
export interface DeviceInfo {
  id: string;
  name: string;
  platform: Platform;
  /** True in the roster copy sent to this same device. */
  self?: boolean;
  state: PlaybackState;
}

/** A transport/control command targeted at a device. */
export type Command =
  | { action: "playPause" }
  | { action: "play" }
  | { action: "pause" }
  | { action: "stop" }
  | { action: "setVolume"; value: number }
  | { action: "toggleMute" }
  | { action: "playStation"; station: StationLite };

// ---- client → server -------------------------------------------------------

export interface HelloMsg {
  t: "hello";
  /** atproto service-auth JWT (aud = this AppView's DID, lxm = CONNECT_LXM). */
  token: string;
  device: {
    id: string;
    name: string;
    platform: Platform;
    state: PlaybackState;
  };
}

export interface StateMsg {
  t: "state";
  state: PlaybackState;
}

export interface CommandMsg {
  t: "command";
  /** deviceId of the target device on the same account. */
  target: string;
  cmd: Command;
}

export type ClientMsg = HelloMsg | StateMsg | CommandMsg | { t: "bye" };

// ---- server → client -------------------------------------------------------

export interface WelcomeMsg {
  t: "welcome";
  did: string;
  deviceId: string;
}

export interface DevicesMsg {
  t: "devices";
  devices: DeviceInfo[];
}

/** A command routed from a peer that this device should apply locally. */
export interface IncomingCommandMsg {
  t: "command";
  from: string;
  cmd: Command;
}

/**
 * Presence summary for the account. `cleanup` asks this device to delete the
 * durable `fm.atradio.actor.status` record because no player is online/playing
 * anymore (the hub picks one online device to do it, since only a client can
 * write to its own PDS).
 */
export interface PresenceMsg {
  t: "presence";
  anyPlaying: boolean;
  cleanup?: boolean;
}

export interface ErrorMsg {
  t: "error";
  code: string;
  message: string;
}

export type ServerMsg =
  | WelcomeMsg
  | DevicesMsg
  | IncomingCommandMsg
  | PresenceMsg
  | ErrorMsg;
