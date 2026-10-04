import { z } from "zod";
function http(value: string) {
	try {
		const u = new URL(value);
		return (
			(u.protocol === "https:" || u.protocol === "http:") &&
			!!u.hostname &&
			!u.username &&
			!u.password
		);
	} catch {
		return false;
	}
}
const optionalUrl = z
	.string()
	.trim()
	.refine(
		(value) => !value || http(value),
		"Enter a valid HTTP or HTTPS URL without credentials.",
	)
	.optional();
export const stationSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "A station name is required.")
		.max(120, "Use 120 characters or fewer."),
	streamUrl: z
		.string()
		.trim()
		.min(1, "A stream URL is required.")
		.refine(
			http,
			"Enter a valid HTTP or HTTPS stream URL without credentials.",
		),
	genre: z.string().trim().max(60, "Use 60 characters or fewer.").optional(),
	homepage: optionalUrl,
	logoUrl: optionalUrl,
	description: z
		.string()
		.trim()
		.max(500, "Use 500 characters or fewer.")
		.optional(),
});
export type StationForm = z.infer<typeof stationSchema>;
export function validateStation(value: unknown): StationForm {
	return stationSchema.parse(value);
}
