import { afterEach, expect, test } from "bun:test";
import { listenerCount } from "../src/api/listeners";
const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
test("listener count uses the web endpoint and exact station identity", async () => {
	const signal = new AbortController().signal;
	globalThis.fetch = async (url, options) => {
		expect(new URL(url).searchParams.get("stations")).toBe("tunein:s123");
		expect(new URL(url).pathname).toBe("/xrpc/fm.atradio.getListenerCounts");
		expect(options.signal).toBe(signal);
		return Response.json({
			counts: [
				{ stationId: "other", listeners: 99 },
				{ stationId: "tunein:s123", listeners: 1234 },
			],
		});
	};
	expect(await listenerCount("tunein:s123", signal)).toBe(1234);
});
test("stations without listener records return zero", async () => {
	globalThis.fetch = async () => Response.json({ counts: [] });
	expect(await listenerCount("rb:1")).toBe(0);
});
test("failed listener requests are not reported as zero listeners", async () => {
	globalThis.fetch = async () => new Response("", { status: 503 });
	await expect(listenerCount("rb:1")).rejects.toThrow(
		"Listener count unavailable",
	);
});
