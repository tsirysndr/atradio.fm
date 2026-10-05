import { test, expect, mock, spyOn } from "bun:test";
import { AtradioAgent } from "@atradio/sdk";
const messages = [];
const deleted = [];
let finalize;
let sessionError;
let storedSessions = [];
let requestedScope;
let requestedAuthorization;
let sessionCalls = 0;
class TokenRefreshError extends Error {}
const session = {
	info: { sub: "did:plc:test" },
	token: {
		access: "never-cross-the-bridge",
		scope: "atproto repo:fm.atradio.actor.status",
	},
};
mock.module("@atcute/oauth-browser-client", () => ({
	configureOAuth() {},
	createAuthorizationUrl: async (options) => {
		requestedAuthorization = options;
		requestedScope = options.scope;
		return new URL("https://provider.test/authorize");
	},
	finalizeAuthorization: () =>
		new Promise((resolve) => {
			finalize = resolve;
		}),
	getSession: async (_did, options) => {
		sessionCalls++;
		if (sessionError && !options?.allowStale) throw sessionError;
		return session;
	},
	listStoredSessions: () => storedSessions,
	deleteStoredSession: (did) => deleted.push(did),
	OAuthUserAgent: class {
		async handle() { throw new Error("Unexpected network call"); }
		async signOut() {}
	},
	TokenRefreshError,
}));
const storage = new Map();
globalThis.localStorage = {
	getItem: (key) => storage.get(key),
	setItem: (key, value) => storage.set(key, value),
	removeItem: (key) => storage.delete(key),
};
globalThis.window = {
	ReactNativeWebView: {
		postMessage: (message) => messages.push(JSON.parse(message)),
	},
};
await import("../src/auth/runtime");
const command = globalThis.window.atradioAuth;
test("OAuth rejects a callback from a different origin", async () => {
	await command(
		1,
		"authCallback",
		"https://evil.test/oauth/callback#code=x&state=y",
	);
	expect(messages.at(-1).error).toBe("Invalid sign-in callback");
});
test("cancelled OAuth cannot sign the user in when token exchange completes later", async () => {
	await command(2, "authStart", "user.test");
	await command(
		3,
		"authCallback",
		"https://atradio.fm/oauth/callback#code=x&state=y",
	);
	await command(4, "authCancel");
	finalize({ session });
	await new Promise((resolve) => setTimeout(resolve, 0));
	await command(5, "authStatus");
	expect(messages.at(-1).result.state).toBe("signedOut");
	expect(deleted).toContain("did:plc:test");
	expect(JSON.stringify(messages)).not.toContain("never-cross-the-bridge");
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
test("OAuth requests listening permission and refreshing preserves saved sessions offline", async () => {
	expect(requestedScope).toContain("repo:fm.atradio.actor.status");
	expect(requestedScope).toContain("repo:fm.atradio.favorite");
	expect(requestedScope).toContain("repo:fm.atradio.audio.settings");
	storedSessions = [session.info.sub];
	await command(6, "authRestore");
	await settle();
	await command(7, "authStatus");
	expect(messages.at(-1).result.canPublishPlays).toBe(true);
	const calls = sessionCalls;
	await command(8, "authRefresh");
	expect(sessionCalls).toBeGreaterThan(calls);
	sessionError = new TypeError("Network request failed");
	const removed = deleted.length;
	await command(9, "authRefresh");
	expect(messages.at(-1).result.state).toBe("signedIn");
	expect(messages.at(-1).result.offline).toBe(true);
	expect(deleted.length).toBe(removed);
	sessionError = undefined;
	await command(10, "authRefresh");
	expect(messages.at(-1).result.offline).toBeUndefined();
});
test("canceling additional consent retains the existing signed-in session", async () => {
	await command(14, "authCancel");
	expect(messages.at(-1).result.state).toBe("signedIn");
	await command(11, "authStart", "user.test");
	await command(12, "authCancel");
	expect(messages.at(-1).result.state).toBe("signedIn");
});
test("revoked sessions require reconnect instead of remaining falsely signed in", async () => {
	sessionError = new TokenRefreshError("revoked");
	await command(13, "authRefresh");
	expect(messages.at(-1).result.state).toBe("signedOut");
	expect(messages.at(-1).result.error).toContain("Sign in again");
	expect(JSON.stringify(messages)).not.toContain("never-cross-the-bridge");
});

test("Bluesky signup requests account creation and completes the in-app OAuth callback", async () => {
	await command(20, "authSignup");
	await settle();
	expect(requestedAuthorization.target).toEqual({
		type: "pds",
		serviceUrl: "https://bsky.social",
	});
	expect(requestedAuthorization.prompt).toBe("create");
	expect(requestedAuthorization.scope).toContain(
		"repo:fm.atradio.audio.settings",
	);
	await command(21, "authStatus");
	expect(messages.at(-1).result.url).toBe("https://provider.test/authorize");
	await command(
		22,
		"authCallback",
		"https://atradio.fm/oauth/callback#code=x&state=y",
	);
	finalize({ session });
	await settle();
	await command(23, "authStatus");
	expect(messages.at(-1).result.state).toBe("signedIn");
	expect(messages.at(-1).result.profile.did).toBe(session.info.sub);
	expect(storage.get("atradio-mobile-handle")).toBe("");
	expect(JSON.stringify(messages)).not.toContain("never-cross-the-bridge");
});


test("favorites read from the PDS; writes require consent and the current account", async () => {
	sessionError = undefined;
	const station = { id: "rb:test", name: "Test radio", source: "radio-browser", streamUrl: "https://radio.test/live" };
	const favorite = mock(async () => "at://did:plc:test/fm.atradio.favorite/key");
	const unfavorite = mock(async () => {});
	const listFavorites = mock(async () => [{ station, rkey: "key" }]);
	const agent = spyOn(AtradioAgent, "fromClient").mockReturnValue({ favorite, unfavorite, listFavorites });
	const action = (name, actor = session.info.sub) => command(30, "stationAction", JSON.stringify({ action: name, actor, station }));
	try {
		await action("listFavorites");
		expect(messages.at(-1)).toEqual({ id: 30, result: [station] });
		await action("favorite");
		expect(messages.at(-1).error).toContain("Sign in again");
		expect(favorite).not.toHaveBeenCalled();
		session.token.scope += " repo:fm.atradio.favorite";
		await command(31, "authRefresh");
		expect(messages.at(-1).result.canFavorite).toBe(true);
		await action("favorite", "did:plc:other");
		expect(messages.at(-1).error).toContain("Account changed");
		expect(favorite).not.toHaveBeenCalled();
		await action("favorite");
		expect(favorite).toHaveBeenCalledWith(station);
		expect(messages.at(-1).result.ok).toBe(true);
		await action("unfavorite");
		expect(unfavorite).toHaveBeenCalledWith(station);
		favorite.mockRejectedValueOnce(new Error("PDS offline"));
		await action("favorite");
		expect(messages.at(-1).error).toBe("PDS offline");
		expect(JSON.stringify(messages)).not.toContain("never-cross-the-bridge");
	} finally {
		agent.mockRestore();
	}
});
