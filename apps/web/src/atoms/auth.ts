import { atom } from "jotai";
import { Client } from "@atcute/client";
import { OAuthUserAgent, type Session } from "@atcute/oauth-browser-client";
import type { Did } from "@atcute/lexicons";
import { AtradioAgent } from "@atradio/sdk";
import type { ActorProfile } from "@/lib/atproto/profile";

/** Current OAuth session (in-memory; the atcute store persists it in IndexedDB). */
export const sessionAtom = atom<Session | null>(null);

/** The logged-in user's public profile (display name / handle / avatar). */
export const authProfileAtom = atom<ActorProfile | null>(null);

/** True while the initial session restore is in flight. */
export const authLoadingAtom = atom(true);

export const didAtom = atom<Did | null>(
  (get) => get(sessionAtom)?.info.sub ?? null,
);

export const isLoggedInAtom = atom((get) => get(sessionAtom) !== null);

/** Authenticated XRPC client, memoized per session. Null when logged out. */
export const clientAtom = atom<Client | null>((get) => {
  const s = get(sessionAtom);
  return s ? new Client({ handler: new OAuthUserAgent(s) }) : null;
});

/**
 * The atradio SDK agent, wrapping the OAuth-authenticated client. Null when
 * logged out. This is the app's single entry point for record reads/writes —
 * everything in `lib/atproto/records` delegates to it.
 */
export const agentAtom = atom<AtradioAgent | null>((get) => {
  const client = get(clientAtom);
  const did = get(didAtom);
  return client && did ? AtradioAgent.fromClient(client, did) : null;
});
