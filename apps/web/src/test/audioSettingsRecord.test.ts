import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUDIO_SETTINGS,
  audioSettingsRecordSchema,
  audioSettingsRecordToData,
  buildAudioSettingsRecord,
  type AudioSettingsData,
} from "@atradio/lexicons";

const CUSTOM: AudioSettingsData = {
  eqEnabled: true,
  eqGains: [6, 4, 2, 0, -2, 0, 2, 4, 6, 8],
  bass: 3,
  treble: -2,
  crossfeedMode: "meier",
  crossfeedDirect: -1.5,
  pbe: 40,
  pbePrecut: 3,
  surroundDelay: 10,
  surroundBalance: 50,
  compThreshold: -12,
  compRatio: 4,
  channelMode: "swap",
  stereoWidth: 130,
};

describe("fm.atradio.audio.settings mappers", () => {
  it("round-trips settings through the record shape", () => {
    const record = buildAudioSettingsRecord(CUSTOM);
    expect(record.$type).toBe("fm.atradio.audio.settings");
    // dB -> tenths of dB in the record (lexicons have no floats)…
    expect(record.crossfeedDirect).toBe(-15);
    expect(record.updatedAt).toBeTruthy();
    // …and back.
    expect(audioSettingsRecordToData(record)).toEqual(CUSTOM);
  });

  it("validates records against the zod schema", () => {
    const record = buildAudioSettingsRecord(CUSTOM);
    expect(audioSettingsRecordSchema.safeParse(record).success).toBe(true);
    expect(
      audioSettingsRecordSchema.safeParse({
        ...record,
        crossfeedMode: "sideways",
      }).success,
    ).toBe(false);
    expect(
      audioSettingsRecordSchema.safeParse({ eqEnabled: true }).success,
    ).toBe(false); // updatedAt is required
  });

  it("fills missing fields with defaults (older records keep working)", () => {
    const data = audioSettingsRecordToData({
      eqEnabled: true,
      updatedAt: new Date().toISOString(),
    });
    expect(data).toEqual({ ...DEFAULT_AUDIO_SETTINGS, eqEnabled: true });
  });
});
