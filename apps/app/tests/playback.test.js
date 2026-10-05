import { afterEach, expect, test } from "bun:test";
import { resolveStation, playlistStream } from "../src/playback/resolve";
import { PlayHistorySync } from "../src/playback/history";
const fetchOriginal = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = fetchOriginal;
});
const station = {
	id: "tunein:s221580",
	source: "tunein",
	name: "AlternativeRadio.us",
	streamUrl:
		"https://api.atradio.fm/api/tunein/Tune.ashx?id=s221580&formats=mp3,aac",
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("saved TuneIn favorites resolve the finite playlist before native playback", async () => {
	let fetched;
	globalThis.fetch = async (url) => {
		fetched = url;
		return new Response(
			"http://avbhost.com/listen/alternativeradio/alt64.pls\nhttps://avbhost.com/listen/alternativeradio/alt64.pls\n",
		);
	};
	const result = await resolveStation(station);
	expect(fetched).toBe(
		"https://media.atradio.fm/api/tunein/Tune.ashx?id=s221580&formats=mp3,aac",
	);
	expect(result.streamUrl).toBe(
		"http://avbhost.com/listen/alternativeradio/alt64.pls",
	);
	expect(result.id).toBe(station.id);
});
test("direct audio and HLS are never read to completion as text", async () => {
	globalThis.fetch = () => {
		throw new Error("must not fetch live audio");
	};
	for (const streamUrl of [
		"https://radio.test/live.mp3",
		"https://radio.test/live.m3u8",
		"https://radio.test/listen.pls",
	])
		expect((await resolveStation({ ...station, streamUrl })).streamUrl).toBe(
			streamUrl,
		);
	expect(playlistStream("[playlist]\nFile1=https://radio.test/live")).toBe(
		"https://radio.test/live",
	);
});
test("empty TuneIn replies and canceled resolution do not start playback", async () => {
	globalThis.fetch = async () => new Response("No streams");
	await expect(resolveStation(station)).rejects.toThrow("playable stream");
	globalThis.fetch = async (_url, { signal }) => {
		signal.throwIfAborted();
	};
	const controller = new AbortController();
	controller.abort();
	await expect(resolveStation(station, controller.signal)).rejects.toThrow();
});
test("history writes only on actual playing, deduplicates pause/resume, and retries failures", async () => {
	let now = 0,
		fail = true,
		count = 0,
		updates = 0;
	const sync = new PlayHistorySync(
		async () => {
			count++;
			if (fail) throw Error("offline");
		},
		() => updates++,
		() => {},
		() => now,
	);
	sync.update("did:plc:a", "buffering", station);
	await tick();
	expect(count).toBe(0);
	sync.update("did:plc:a", "playing", station);
	await tick();
	expect(count).toBe(1);
	sync.update("did:plc:a", "playing", station);
	await tick();
	expect(count).toBe(1);
	now = 16000;
	fail = false;
	sync.update("did:plc:a", "playing", station);
	await tick();
	expect(count).toBe(2);
	expect(updates).toBe(1);
	sync.update("did:plc:a", "paused", station);
	sync.update("did:plc:a", "playing", station);
	await tick();
	expect(count).toBe(2);
	sync.update(undefined, "playing", station);
	await tick();
	expect(count).toBe(2);
});
test("rapid station changes write in order and retain account identity", async () => {
	const writes = [];
	let finish;
	const sync = new PlayHistorySync(
		(did, s) => {
			writes.push([did, s.id]);
			return new Promise((resolve) => {
				finish = resolve;
			});
		},
		() => {},
		() => {},
	);
	sync.update("did:plc:a", "playing", station);
	sync.update("did:plc:b", "playing", { ...station, id: "rb:next" });
	expect(writes).toHaveLength(1);
	finish();
	await tick();
	expect(writes).toEqual([
		["did:plc:a", station.id],
		["did:plc:b", "rb:next"],
	]);
	finish();
	await tick();
});
