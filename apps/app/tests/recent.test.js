import { test, expect, afterEach } from "bun:test";
import { recentlyPlayed } from "../src/api/recent";
const original = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = original;
});
test("global plays preserve listener identity and pagination while converting station artwork", async () => {
	let request;
	const signal = new AbortController().signal;
	globalThis.fetch = async (url, opts) => {
		request = { url: new URL(url), signal: opts.signal };
		return Response.json({
			cursor: "next-page",
			items: [
				{
					station: {
						stationId: "rb:1",
						streamUrl: "https://stream.example/live",
						name: "Live",
						logo: "https://example/art.png",
					},
					actor: { did: "did:plc:listener", handle: "listener.test" },
					playedAt: "2026-10-04T08:00:00Z",
				},
				{ station: { stationId: "bad", streamUrl: "file:///private" } },
			],
		});
	};
	const page = await recentlyPlayed("2026-10-04T12:00:00Z", signal);
	expect(request.url.pathname).toBe("/xrpc/fm.atradio.getGlobalRecentlyPlayed");
	expect(request.url.searchParams.get("cursor")).toBe("2026-10-04T12:00:00Z");
	expect(request.signal).toBe(signal);
	expect(page.cursor).toBe("next-page");
	expect(page.items).toHaveLength(1);
	expect(page.items[0].station.id).toBe("rb:1");
	expect(page.items[0].station.favicon).toBe("https://example/art.png");
	expect(page.items[0].actor.handle).toBe("listener.test");
});
test("feed failures surface so the UI can retry instead of appearing empty", async () => {
	globalThis.fetch = async () => new Response("", { status: 503 });
	await expect(recentlyPlayed()).rejects.toThrow("unavailable");
});
