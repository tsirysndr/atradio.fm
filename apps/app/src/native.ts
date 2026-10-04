import { requireOptionalNativeModule } from "expo";
import type { Station } from "./types";
export type AuthState = {
  state:
    | "signedOut"
    | "starting"
    | "authorizing"
    | "restoring"
    | "signedIn"
    | "error";
  url?: string;
  error?: string;
  profile?: { did: string; handle: string; display_name?: string };
  offline?: boolean;
};
export type Playback = {
  state: "playing" | "paused" | "stopped" | "buffering" | "error";
  station?: Station;
  title?: string;
  error?: string;
};
const engine = requireOptionalNativeModule<{
  play(station: string): Promise<void>;
  control(action: string): Promise<void>;
  status(): Promise<string>;
  auth(command: string, handle: string): Promise<string>;
}>("AtradioEngine");
export const nativeAvailable = Boolean(engine);
function requireEngine() {
  if (!engine)
    throw new Error(
      "Install an Android build of atradio.fm to use native playback and sign in.",
    );
  return engine;
}
export const radio = {
  play: (station: Station) => requireEngine().play(JSON.stringify(station)),
  control: (action: "play" | "pause" | "stop") =>
    requireEngine().control(action),
  status: async (): Promise<Playback> =>
    engine ? JSON.parse(await engine.status()) : { state: "stopped" },
  auth: async (command: string, handle = ""): Promise<AuthState> =>
    JSON.parse(await requireEngine().auth(command, handle)),
};
