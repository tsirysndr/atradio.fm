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
