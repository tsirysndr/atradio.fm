import { z } from "zod";
import { probeStream } from "@/lib/audio/probeStream";

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Optional field that must be empty or a valid http(s) URL. */
const emptyOrUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || isValidHttpUrl(v), {
    message: "Enter a valid http(s) URL",
  })
  .optional();

/**
 * Validates the "add your own station" form.
 *
 * Beyond format checks, an async refinement actually verifies the stream URL is
 * playable (see probeStream). It is skipped when `skipStreamCheck` is set, which
 * the modal toggles for the "add anyway" escape hatch (e.g. HLS streams that
 * only play through hls.js).
 */
export const stationFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "A name is required")
      .max(120, "That name is too long"),
    streamUrl: z
      .string()
      .trim()
      .min(1, "A stream URL is required")
      .refine(isValidHttpUrl, "Enter a valid http(s) stream URL"),
    genre: z.string().trim().max(60, "That genre is too long").optional(),
    homepage: emptyOrUrl,
    logoUrl: emptyOrUrl,
    description: z
      .string()
      .trim()
      .max(500, "That description is too long")
      .optional(),
    skipStreamCheck: z.boolean().optional(),
  })
  .superRefine(async (data, ctx) => {
    if (data.skipStreamCheck) return;
    // Only probe once the URL is a well-formed http(s) URL — otherwise the
    // format error above is the relevant message.
    if (!isValidHttpUrl(data.streamUrl)) return;

    const result = await probeStream(data.streamUrl);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["streamUrl"],
        message: result.reason ?? "This URL isn't a playable stream.",
      });
    }
  });

export type StationFormValues = z.infer<typeof stationFormSchema>;
