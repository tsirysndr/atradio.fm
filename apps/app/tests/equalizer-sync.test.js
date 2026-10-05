import { expect, test } from "bun:test";
import { DEFAULT_AUDIO_SETTINGS } from "@atradio/lexicons";
import {
	defaultEqualizer,
	fromRepoEqualizer,
	mergeRepoEqualizer,
} from "../src/playback/equalizer";
test("web EQ gains convert dB to native tenths and preserve local precut", () => {
	const data = {
		...DEFAULT_AUDIO_SETTINGS,
		eqEnabled: true,
		eqGains: [-24, -12, -3, 0, 1, 3, 6, 9, 12, 24],
	};
	const eq = fromRepoEqualizer(data, -40);
	expect(eq.enabled).toBe(true);
	expect(eq.precut).toBe(-40);
	expect(eq.bands.map((b) => b.gain)).toEqual([
		-240, -120, -30, 0, 10, 30, 60, 90, 120, 240,
	]);
	expect(mergeRepoEqualizer(data, eq).eqGains).toEqual(data.eqGains);
});
test("saving mobile EQ preserves existing web DSP settings", () => {
	const remote = {
		...DEFAULT_AUDIO_SETTINGS,
		bass: 6,
		treble: -2,
		crossfeedMode: "meier",
		crossfeedDirect: -3,
		pbe: 30,
		compThreshold: -12,
		stereoWidth: 80,
	};
	const eq = defaultEqualizer();
	eq.enabled = true;
	eq.bands[3].gain = 60;
	const saved = mergeRepoEqualizer(remote, eq);
	expect(saved).toEqual({
		...remote,
		eqEnabled: true,
		eqGains: [0, 0, 0, 6, 0, 0, 0, 0, 0, 0],
	});
	expect(remote.eqEnabled).toBe(false);
});
test("a new EQ record has web defaults and malformed bands cannot be saved", () => {
	expect(mergeRepoEqualizer(null, defaultEqualizer())).toEqual(
		DEFAULT_AUDIO_SETTINGS,
	);
	expect(() => mergeRepoEqualizer(null, { enabled: true, bands: [] })).toThrow(
		"Invalid",
	);
	const eq = defaultEqualizer();
	eq.bands[0].frequency = 1000;
	expect(() => mergeRepoEqualizer(null, eq)).toThrow("order");
});
