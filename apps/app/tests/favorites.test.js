import { afterEach, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { loadFavorites } from "../src/api/favorites";
import {
	prepareAuthRuntime,
	attachAuthRuntime,
	detachAuthRuntime,
	receiveAuthMessage,
} from "../src/auth/client";

// Load the exact polyfill used by React Native's setUpXHR, not Bun's native
// AbortController (which supports methods unavailable on the device).
const nativeRequire = createRequire(import.meta.resolve("react-native/package.json"));
const { AbortController } = nativeRequire("abort-controller/dist/abort-controller.js");
const owner = Symbol("favorites-test");
const station = {
	id: "rb:test",
	name: "Saved radio",
	streamUrl: "https://radio.test/live",
	source: "radio-browser",
};
afterEach(() => detachAuthRuntime(owner));

function runtime(respond) {
	prepareAuthRuntime(owner);
	attachAuthRuntime(owner, (script) => {
		const [id, command, argument] = JSON.parse(
			`[${script.slice("window.atradioAuth(".length, -");true;".length)}]`,
		);
		expect(command).toBe("stationAction");
		expect(JSON.parse(argument)).toEqual({
			action: "listFavorites",
			actor: "did:plc:test",
		});
		respond((message) => receiveAuthMessage(JSON.stringify({ id, ...message })));
	});
}

test("saved stations load and deduplicate with React Native's AbortSignal", async () => {
	const controller = new AbortController();
	expect(controller.signal.throwIfAborted).toBeUndefined();
	runtime((reply) => reply({ result: [station, station] }));
	await expect(loadFavorites("did:plc:test", controller.signal)).resolves.toEqual([station]);
});

test("a canceled favorites load rejects instead of accepting a late bridge response", async () => {
	const controller = new AbortController();
	let reply;
	runtime((respond) => { reply = respond; });
	const loading = loadFavorites("did:plc:test", controller.signal);
	controller.abort();
	reply({ result: [station] });
	await expect(loading).rejects.toMatchObject({ name: "AbortError" });
});

test("favorites bridge failures remain errors, not an empty library", async () => {
	runtime((reply) => reply({ error: "PDS unavailable" }));
	await expect(loadFavorites("did:plc:test", new AbortController().signal))
		.rejects.toThrow("PDS unavailable");
});
