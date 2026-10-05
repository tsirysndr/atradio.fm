import { defaultDsp } from "./playback/equalizer";
import type { EqSettings } from "./playback/equalizer";
import { resolveStation } from "./playback/resolve";
import { auth } from "./auth/client";
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
	canPublishPlays?: boolean;
	canSyncEqualizer?: boolean;
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
	getEqualizer(): Promise<string>;
	setEqualizer(json: string): Promise<void>;
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
	play: async (station: Station, signal?: AbortSignal) => {
		const resolved = await resolveStation(station, signal);
		if (signal?.aborted) return;
		await requireEngine().play(JSON.stringify(resolved));
	},
	control: (action: "play" | "pause" | "stop") =>
		requireEngine().control(action),
	status: async (): Promise<Playback> =>
		engine ? JSON.parse(await engine.status()) : { state: "stopped" },
	getEqualizer: async (): Promise<EqSettings | null> =>
		JSON.parse(await requireEngine().getEqualizer()),
	setEqualizer: (settings: EqSettings) =>
		requireEngine().setEqualizer(
			JSON.stringify({ ...settings, dsp: { ...defaultDsp, ...settings.dsp } }),
		),
	auth,
};
