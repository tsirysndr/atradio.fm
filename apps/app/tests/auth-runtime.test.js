import { test, expect, mock } from "bun:test";
const messages = [];
const deleted = [];
let finalize;
const session = {
	info: { sub: "did:plc:test" },
	token: { access: "never-cross-the-bridge" },
};
mock.module("@atcute/oauth-browser-client", () => ({
	configureOAuth() {},
	createAuthorizationUrl: async () =>
		new URL("https://provider.test/authorize"),
	finalizeAuthorization: () =>
		new Promise((resolve) => {
			finalize = resolve;
		}),
	getSession: async () => session,
	listStoredSessions: () => [],
	deleteStoredSession: (did) => deleted.push(did),
	OAuthUserAgent: class {
		async signOut() {}
	},
	TokenRefreshError: class extends Error {},
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
