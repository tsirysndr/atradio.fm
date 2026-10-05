import {
	DEFAULT_AUDIO_SETTINGS,
	EQ_BANDS_HZ,
	type AudioSettingsData,
} from "@atradio/lexicons";
export type DspSettings = Omit<AudioSettingsData, "eqEnabled" | "eqGains">;
export const {
	eqEnabled: _enabled,
	eqGains: _gains,
	...defaultDsp
} = DEFAULT_AUDIO_SETTINGS;
export type EqSettings = {
	dsp?: Partial<DspSettings>;
	balance?: number;
	enabled: boolean;
	precut: number;
	bands: { frequency: number; q: number; gain: number }[];
};
export const defaultEqualizer = (): EqSettings => ({
	enabled: false,
	precut: 0,
	bands: EQ_BANDS_HZ.map((frequency) => ({ frequency, q: 10, gain: 0 })),
});
export function fromRepoEqualizer(
	data: AudioSettingsData,
	precut = 0,
	balance = 0,
): EqSettings {
	return {
		dsp: Object.fromEntries(
			Object.keys(defaultDsp).map((key) => [
				key,
				data[key as keyof DspSettings],
			]),
		) as DspSettings,
		balance,
		enabled: data.eqEnabled,
		precut,
		bands: EQ_BANDS_HZ.map((frequency, i) => ({
			frequency,
			q: 10,
			gain: Math.round(
				Math.max(
					-24,
					Math.min(24, Number.isFinite(data.eqGains[i]) ? data.eqGains[i] : 0),
				) * 10,
			),
		})),
	};
}
export function mergeRepoEqualizer(
	existing: AudioSettingsData | null,
	eq: EqSettings,
): AudioSettingsData {
	if (
		typeof eq.enabled !== "boolean" ||
		eq.bands?.length !== 10 ||
		eq.bands.some((b) => !Number.isFinite(b.gain))
	)
		throw new Error("Invalid equalizer settings.");
	return {
		...(existing ?? DEFAULT_AUDIO_SETTINGS),
		...eq.dsp,
		eqEnabled: eq.enabled,
		eqGains: EQ_BANDS_HZ.map((frequency, i) => {
			if (eq.bands[i].frequency !== frequency)
				throw new Error("Invalid equalizer band order.");
			return Math.round(Math.max(-240, Math.min(240, eq.bands[i].gain)) / 10);
		}),
	};
}

// Only repository-supported fields participate in the save debounce.
export const repoSettingsKey = (settings: EqSettings) =>
	JSON.stringify({
		enabled: settings.enabled,
		bands: settings.bands,
		dsp: settings.dsp,
	});
