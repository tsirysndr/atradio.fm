import { atom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { RockboxPlayer, ChannelMode, CrossfeedMode } from "rockbox-wasm";
import {
  DEFAULT_AUDIO_SETTINGS as DEFAULTS,
  type AudioSettingsData,
} from "@atradio/lexicons";

/** The 10 Rockbox EQ band centre frequencies (60 Hz … 20 kHz). */
export const EQ_CUTOFFS = RockboxPlayer.EQ_BAND_CUTOFFS;

// Every DSP setting persists to localStorage (atomWithStorage) so the audio
// chain survives reloads — applyAudioSettings() pushes the whole snapshot to
// the engine once it boots. Defaults come from @atradio/lexicons so the local
// state, the fm.atradio.audioSettings record, and other devices agree.

export const eqEnabledAtom = atomWithStorage(
  "atradio:eq.enabled",
  DEFAULTS.eqEnabled,
);
export const eqGainsAtom = atomWithStorage<number[]>("atradio:eq.gains", [
  ...DEFAULTS.eqGains,
]);

export const bassAtom = atomWithStorage("atradio:tone.bass", DEFAULTS.bass); // dB
export const trebleAtom = atomWithStorage(
  "atradio:tone.treble",
  DEFAULTS.treble,
); // dB

export const crossfeedModeAtom = atomWithStorage<CrossfeedMode>(
  "atradio:crossfeed.mode",
  DEFAULTS.crossfeedMode as CrossfeedMode,
);
export const crossfeedDirectAtom = atomWithStorage(
  "atradio:crossfeed.direct",
  DEFAULTS.crossfeedDirect,
); // dB (≤ 0)

export const pbeAtom = atomWithStorage("atradio:pbe.strength", DEFAULTS.pbe); // 0–100 %
export const pbePrecutAtom = atomWithStorage(
  "atradio:pbe.precut",
  DEFAULTS.pbePrecut,
); // dB cut

export const surroundDelayAtom = atomWithStorage(
  "atradio:surround.delay",
  DEFAULTS.surroundDelay,
); // ms, 0 = off
export const surroundBalanceAtom = atomWithStorage(
  "atradio:surround.balance",
  DEFAULTS.surroundBalance,
); // %

export const compThresholdAtom = atomWithStorage(
  "atradio:comp.threshold",
  DEFAULTS.compThreshold,
); // dB, 0 = off
export const compRatioAtom = atomWithStorage(
  "atradio:comp.ratio",
  DEFAULTS.compRatio,
);

export const channelModeAtom = atomWithStorage<ChannelMode>(
  "atradio:channel.mode",
  DEFAULTS.channelMode as ChannelMode,
);
export const stereoWidthAtom = atomWithStorage(
  "atradio:channel.width",
  DEFAULTS.stereoWidth,
); // %

export interface AudioSettings {
  eqEnabled: boolean;
  eqGains: number[];
  bass: number;
  treble: number;
  crossfeedMode: CrossfeedMode;
  crossfeedDirect: number;
  pbe: number;
  pbePrecut: number;
  surroundDelay: number;
  surroundBalance: number;
  compThreshold: number;
  compRatio: number;
  channelMode: ChannelMode;
  stereoWidth: number;
}

/** Read the current value of every audio-setting atom as a plain snapshot. */
export function useAudioSettingsSnapshot(): AudioSettings {
  return {
    eqEnabled: useAtomValue(eqEnabledAtom),
    eqGains: useAtomValue(eqGainsAtom),
    bass: useAtomValue(bassAtom),
    treble: useAtomValue(trebleAtom),
    crossfeedMode: useAtomValue(crossfeedModeAtom),
    crossfeedDirect: useAtomValue(crossfeedDirectAtom),
    pbe: useAtomValue(pbeAtom),
    pbePrecut: useAtomValue(pbePrecutAtom),
    surroundDelay: useAtomValue(surroundDelayAtom),
    surroundBalance: useAtomValue(surroundBalanceAtom),
    compThreshold: useAtomValue(compThresholdAtom),
    compRatio: useAtomValue(compRatioAtom),
    channelMode: useAtomValue(channelModeAtom),
    stereoWidth: useAtomValue(stereoWidthAtom),
  };
}

/** Push every persisted setting to the engine (call once it's ready). */
export function applyAudioSettings(p: RockboxPlayer, s: AudioSettings) {
  p.setEqEnabled(s.eqEnabled);
  s.eqGains.forEach((gain, i) => p.setEqBand(i, EQ_CUTOFFS[i], 1.0, gain));
  p.setTone(s.bass, s.treble);
  // Crossfeed gains and the PBE precut are in tenths of dB (≤ 0).
  p.setCrossfeed(s.crossfeedMode, Math.round(s.crossfeedDirect * 10));
  p.setPbe(s.pbe, -Math.round(s.pbePrecut * 10));
  p.setSurround(s.surroundDelay, s.surroundBalance, 0, 0);
  p.setCompressor(s.compThreshold, 0, s.compRatio, 0, 0, 0);
  p.setChannelMode(s.channelMode);
  p.setStereoWidth(s.stereoWidth);
}

/** Web `AudioSettings` (rockbox enums) -> lexicon `AudioSettingsData`. The
 *  shapes are identical; only the enum nominal types differ. */
export const toAudioSettingsData = (s: AudioSettings): AudioSettingsData => ({
  ...s,
  crossfeedMode: s.crossfeedMode as AudioSettingsData["crossfeedMode"],
  channelMode: s.channelMode as AudioSettingsData["channelMode"],
});

/** Lexicon `AudioSettingsData` -> web `AudioSettings`. */
export const fromAudioSettingsData = (d: AudioSettingsData): AudioSettings => ({
  ...d,
  crossfeedMode: d.crossfeedMode as CrossfeedMode,
  channelMode: d.channelMode as ChannelMode,
});

/** Overwrite every setting atom at once (used when restoring the synced
 *  fm.atradio.audioSettings record from the PDS). */
export const applyRemoteAudioSettingsAtom = atom(
  null,
  (_get, set, s: AudioSettings) => {
    set(eqEnabledAtom, s.eqEnabled);
    set(eqGainsAtom, [...s.eqGains]);
    set(bassAtom, s.bass);
    set(trebleAtom, s.treble);
    set(crossfeedModeAtom, s.crossfeedMode);
    set(crossfeedDirectAtom, s.crossfeedDirect);
    set(pbeAtom, s.pbe);
    set(pbePrecutAtom, s.pbePrecut);
    set(surroundDelayAtom, s.surroundDelay);
    set(surroundBalanceAtom, s.surroundBalance);
    set(compThresholdAtom, s.compThreshold);
    set(compRatioAtom, s.compRatio);
    set(channelModeAtom, s.channelMode);
    set(stereoWidthAtom, s.stereoWidth);
  },
);
