import { mergeRepoEqualizer } from "../playback/equalizer";
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
let previousState: any = { state: "signedOut" };
function signedIn(session: any, handle = currentHandle) {
	return {
		state: "signedIn",
		profile: { did: session.info.sub, handle: handle || session.info.sub },
		canSyncEqualizer:
			session.token.scope
				?.split(/\s+/)
				.includes("repo:fm.atradio.audio.settings") ?? false,
		canPublishPlays:
			session.token.scope
				?.split(/\s+/)
				.includes("repo:fm.atradio.actor.status") ?? false,
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
			if (input.actor && input.actor !== state.profile.did)
				throw new Error("Account changed; listening update canceled.");
			if (
				![
					"comment",
					"reaction",
					"deleteComment",
					"registerStation",
					"playStatus",
					"getAudioSettings",
					"saveEqualizer",
				].includes(input.action)
			)
				throw new Error("Unsupported station action");
			const did = state.profile.did;
			const actionGeneration = generation;
			let session;
			try {
				session = await getSession(did);
			} catch (e) {
				if (e instanceof TokenRefreshError) {
					deleteStoredSession(did);
					state = {
						state: "signedOut",
						error: "Your session was revoked or expired. Sign in again.",
					};
					bridge.postMessage(JSON.stringify({ authState: state }));
				}
				throw e;
			}
			if (
				actionGeneration !== generation ||
				state.state !== "signedIn" ||
				state.profile.did !== did
			)
				throw new Error("Account changed; action canceled.");
			const needed =
				input.action === "saveEqualizer"
					? "repo:fm.atradio.audio.settings"
					: input.action === "playStatus"
						? "repo:fm.atradio.actor.status"
						: input.action === "reaction"
							? "repo:fm.atradio.reaction"
							: input.action === "registerStation"
								? "repo:fm.atradio.station"
								: "repo:fm.atradio.comment";
			if (
				input.action !== "getAudioSettings" &&
				!session.token.scope.split(/\s+/).includes(needed)
			)
				throw new Error(
					"Sign in again to grant permission for this station action.",
				);
			const agent = AtradioAgent.fromClient(
				new Client({ handler: new OAuthUserAgent(session) }),
				session.info.sub,
			);
			if (input.action === "getAudioSettings") {
				const result = await agent.getAudioSettings();
				bridge.postMessage(JSON.stringify({ id, result }));
				return;
			}
			if (input.action === "saveEqualizer") {
				// Read before merge: mobile only edits EQ; preserve the web's DSP controls.
				const existing = await agent.getAudioSettings();
				if (actionGeneration !== generation)
					throw new Error("Account changed; equalizer save canceled.");
				await agent.putAudioSettings(
					mergeRepoEqualizer(existing, input.settings),
				);
				bridge.postMessage(JSON.stringify({ id, result: { ok: true } }));
				return;
			}
			let uri;
			if (input.action === "playStatus") {
				await agent.setPlayStatus(input.station);
				bridge.postMessage(JSON.stringify({ id, result: { ok: true } }));
				return;
			}
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
		if (cmd === "authStart" || cmd === "authSignup") {
			const gen = ++generation;
			previousState =
				state.state === "signedIn" ? state : { state: "signedOut" };
			currentHandle = cmd === "authSignup" ? "" : argument;
			state = { state: "starting" };
			task(gen, async () => {
				const url = await createAuthorizationUrl({
					target:
						cmd === "authSignup"
							? { type: "pds", serviceUrl: "https://bsky.social" }
							: { type: "account", identifier: argument as ActorIdentifier },
					...(cmd === "authSignup" ? { prompt: "create" as const } : {}),
					scope:
						"atproto repo:fm.atradio.comment repo:fm.atradio.reaction repo:fm.atradio.station repo:fm.atradio.actor.status repo:fm.atradio.audio.settings",
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
		} else if (cmd === "authRefresh") {
			if (state.state === "signedIn") {
				const gen = generation;
				const did = state.profile.did;
				try {
					const session = await getSession(did);
					if (gen === generation) state = signedIn(session);
				} catch (e) {
					if (gen === generation) {
						if (e instanceof TokenRefreshError) {
							deleteStoredSession(did);
							state = {
								state: "signedOut",
								error: "Your session was revoked or expired. Sign in again.",
							};
						} else state = { ...state, offline: true };
					}
				}
			}
		} else if (cmd === "authCancel" || cmd === "authLogout") {
			++generation;
			if (cmd === "authCancel") {
				if (["starting", "authorizing", "error"].includes(state.state))
					state = previousState;
			} else {
				state = { state: "signedOut" };
				previousState = state;
			}
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
