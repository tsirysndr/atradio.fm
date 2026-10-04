import { test, expect } from "bun:test";
import { stationSchema } from "../src/stationValidation";
import { genres } from "../src/genres";
test("registration trims fields and permits optional fields to be empty", () => {
	expect(
		stationSchema.parse({
			name: "  My Radio ",
			streamUrl: " https://radio.test/live.mp3 ",
			homepage: "",
		}),
	).toEqual({
		name: "My Radio",
		streamUrl: "https://radio.test/live.mp3",
		homepage: "",
	});
});
test("registration rejects unsafe streams, invalid artwork, missing name and oversized text", () => {
	const valid = { name: "Radio", streamUrl: "https://radio.test/live" };
	for (const patch of [
		{ name: "" },
		{ name: "x".repeat(121) },
		{ streamUrl: "file:///private/file" },
		{ streamUrl: "javascript:alert(1)" },
		{ streamUrl: "https://user:password@radio.test/live" },
		{ logoUrl: "not a URL" },
		{ description: "x".repeat(501) },
	])
		expect(stationSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
});
test("web genre labels map to the exact Radio Browser tags", () => {
	expect(genres).toHaveLength(34);
	expect(genres.find((g) => g.label === "Lo-fi").term).toBe("lofi");
	expect(genres.find((g) => g.label === "Chillout").term).toBe("chill");
	expect(genres.find((g) => g.label === "Drum & Bass").term).toBe(
		"drum and bass",
	);
});
