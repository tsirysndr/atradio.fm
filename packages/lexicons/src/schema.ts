import { z } from "zod";

export const stationSourceSchema = z.enum([
  "radio-browser",
  "tunein",
  "custom",
]);

export const stationInfoSchema = z.object({
  stationId: z.string(),
  name: z.string(),
  streamUrl: z.string(),
  source: stationSourceSchema,
  description: z.string().optional(),
  genre: z.string().optional(),
  homepage: z.string().optional(),
  logo: z.string().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  bitrate: z.number().optional(),
  codec: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const strongRefSchema = z.object({
  uri: z.string(),
  cid: z.string(),
});

export const favoriteRecordSchema = z.object({
  $type: z.literal("fm.atradio.favorite").optional(),
  station: stationInfoSchema,
  subject: strongRefSchema.optional(),
  createdAt: z.string(),
});

export const stationRecordSchema = z.object({
  $type: z.literal("fm.atradio.station").optional(),
  name: z.string(),
  streamUrl: z.string(),
  description: z.string().optional(),
  genre: z.string().optional(),
  homepage: z.string().optional(),
  logo: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
});

export const stationViewSchema = z.object({
  uri: z.string(),
  station: stationInfoSchema,
  createdAt: z.string(),
});

export const stationListOutputSchema = z.object({
  cursor: z.string().optional(),
  total: z.number(),
  items: z.array(stationViewSchema),
});

export const crossfeedModeSchema = z.enum(["off", "meier", "custom"]);

export const channelModeSchema = z.enum([
  "stereo",
  "mono",
  "custom",
  "mono-left",
  "mono-right",
  "karaoke",
  "swap",
]);

export const audioSettingsRecordSchema = z.object({
  $type: z.literal("fm.atradio.audioSettings").optional(),
  eqEnabled: z.boolean().optional(),
  eqGains: z.array(z.number().min(-24).max(24)).optional(),
  bass: z.number().min(-24).max(24).optional(),
  treble: z.number().min(-24).max(24).optional(),
  crossfeedMode: crossfeedModeSchema.optional(),
  /** Tenths of dB (<= 0). */
  crossfeedDirect: z.number().min(-60).max(0).optional(),
  pbe: z.number().min(0).max(100).optional(),
  pbePrecut: z.number().min(0).max(24).optional(),
  surroundDelay: z.number().min(0).max(30).optional(),
  surroundBalance: z.number().min(0).max(100).optional(),
  compThreshold: z.number().min(-30).max(0).optional(),
  compRatio: z.number().min(2).max(10).optional(),
  channelMode: channelModeSchema.optional(),
  stereoWidth: z.number().min(0).max(255).optional(),
  updatedAt: z.string(),
});
