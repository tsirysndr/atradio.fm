import { Client } from "@atcute/client";
import { AtradioAgent } from "@atradio/sdk";
import {
	configureOAuth,
	createAuthorizationUrl,
	finalizeAuthorization,
	getSession,
	listStoredSessions,
	deleteStoredSession,
	OAuthUserAgent,
	TokenRefreshError,
} from "@atcute/oauth-browser-client";
import {
	LocalActorResolver,
	CompositeHandleResolver,
	WellKnownHandleResolver,
	DohJsonHandleResolver,
	CompositeDidDocumentResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
} from "@atcute/identity-resolver";
import type { ActorIdentifier } from "@atcute/lexicons";
const bridge = (window as any).ReactNativeWebView;
const resolver = new LocalActorResolver({
	handleResolver: new CompositeHandleResolver({
		strategy: "race",
		methods: {
			http: new WellKnownHandleResolver(),
			dns: new DohJsonHandleResolver({
				dohUrl: "https://mozilla.cloudflare-dns.com/dns-query",
			}),
		},
	}),
	didDocumentResolver: new CompositeDidDocumentResolver({
		methods: {
			plc: new PlcDidDocumentResolver(),
			web: new WebDidDocumentResolver(),
		},
	}),
});
configureOAuth({
	metadata: {
		client_id: "https://atradio.fm/client-metadata.json",
		redirect_uri: "https://atradio.fm/oauth/callback",
	},
	identityResolver: resolver,
	storageName: "atradio-mobile-atcute",
});
let state: any = { state: "signedOut" };
let generation = 0;
let currentHandle = "";
function signedIn(session: any, handle = currentHandle) {
	return {
		state: "signedIn",
		profile: { did: session.info.sub, handle: handle || session.info.sub },
	};
}
function task(gen: number, work: () => Promise<any>) {
	void work()
		.then((next) => {
			if (generation === gen) state = next;
		})
		.catch((e) => {
			if (generation === gen)
				state = {
					state: "error",
					error:
						e instanceof Error ? e.message : "Sign-in failed. Please retry.",
				};
		});
}
(window as any).atradioAuth = async (
	id: number,
	cmd: string,
	argument = "",
) => {
	try {
		if (cmd === "stationAction") {
			if (state.state !== "signedIn")
				throw new Error("Sign in to join the conversation.");
			const input = JSON.parse(argument);
			if (
				!["comment", "reaction", "deleteComment", "registerStation"].includes(
					input.action,
				)
			)
				throw new Error("Unsupported station action");
			const session = await getSession(state.profile.did);
			const needed =
				input.action === "reaction"
					? "repo:fm.atradio.reaction"
					: input.action === "registerStation"
						? "repo:fm.atradio.station"
						: "repo:fm.atradio.comment";
			if (!session.token.scope.split(/\s+/).includes(needed))
				throw new Error(
					"Please sign out and sign in again to enable this station action.",
				);
			const agent = AtradioAgent.fromClient(
				new Client({ handler: new OAuthUserAgent(session) }),
				session.info.sub,
			);
			let uri;
			if (input.action === "registerStation") {
				const { validateStation } = await import("../stationValidation");
				const draft = validateStation(input.draft);
				const result = await agent.createStation(draft);
				bridge.postMessage(JSON.stringify({ id, result }));
				return;
			}
			if (input.action === "comment") {
				if (
					(!input.text?.trim() && !input.gif) ||
					[...(input.text || "")].length > 1000
				)
					throw new Error(
						"Write a comment (up to 1,000 characters) or choose a GIF.",
					);
				uri = await agent.comment(input.station, input.text.trim(), {
					gif: input.gif,
				});
			} else if (input.action === "reaction") {
				if (
					![
						"❤️",
						"🔥",
						"🎶",
						"🎵",
						"🎧",
						"🎸",
						"🎹",
						"🥁",
						"🎤",
						"🕺",
						"💃",
						"🙌",
						"👏",
						"🤯",
						"😂",
					].includes(input.emoji)
				)
					throw new Error("Choose a reaction from the picker.");
				uri = await agent.reaction(input.station, input.emoji);
			} else {
				if (
					!input.uri.startsWith(`at://${session.info.sub}/fm.atradio.comment/`)
				)
					throw new Error("You can only delete your own comments.");
				await agent.deleteComment(input.uri);
			}
			bridge.postMessage(JSON.stringify({ id, result: { uri, ok: true } }));
			return;
		}
		if (cmd === "authStart") {
			const gen = ++generation;
			currentHandle = argument;
			state = { state: "starting" };
			task(gen, async () => {
				const url = await createAuthorizationUrl({
					target: { type: "account", identifier: argument as ActorIdentifier },
					scope:
						"atproto repo:fm.atradio.comment repo:fm.atradio.reaction repo:fm.atradio.station",
				});
				return { state: "authorizing", url: url.toString() };
			});
		} else if (cmd === "authCallback") {
			const gen = generation;
			const url = new URL(argument);
			if (
				url.origin !== "https://atradio.fm" ||
				url.pathname !== "/oauth/callback"
			)
				throw new Error("Invalid sign-in callback");
			state = { state: "authorizing" };
			task(gen, async () => {
				const hash = new URLSearchParams(url.hash.slice(1));
				const { session } = await finalizeAuthorization(
					hash.has("state") ? hash : url.searchParams,
				);
				if (gen !== generation) {
					deleteStoredSession(session.info.sub);
					return { state: "signedOut" };
				}
				localStorage.setItem("atradio-mobile-handle", currentHandle);
				return signedIn(session);
			});
		} else if (cmd === "authRestore") {
			const gen = ++generation;
			state = { state: "restoring" };
			task(gen, async () => {
				const did = listStoredSessions()[0];
				if (!did) return { state: "signedOut" };
				currentHandle = localStorage.getItem("atradio-mobile-handle") || "";
				try {
					return signedIn(await getSession(did));
				} catch (e) {
					if (e instanceof TokenRefreshError) {
						deleteStoredSession(did);
						return { state: "signedOut" };
					}
					return {
						...signedIn(await getSession(did, { allowStale: true })),
						offline: true,
					};
				}
			});
		} else if (cmd === "authCancel" || cmd === "authLogout") {
			++generation;
			state = { state: "signedOut" };
			if (cmd === "authLogout") {
				for (const did of listStoredSessions()) {
					const session = await getSession(did, { allowStale: true }).catch(
						() => null,
					);
					deleteStoredSession(did);
					if (session)
						void new OAuthUserAgent(session).signOut().catch(() => {});
				}
				localStorage.removeItem("atradio-mobile-handle");
			}
		}
		bridge.postMessage(JSON.stringify({ id, result: state }));
	} catch (e) {
		bridge.postMessage(
			JSON.stringify({
				id,
				error: e instanceof Error ? e.message : "Authentication unavailable",
			}),
		);
	}
};
bridge.postMessage(JSON.stringify({ ready: true }));
