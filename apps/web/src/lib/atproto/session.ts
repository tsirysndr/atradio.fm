import "@atcute/atproto"; // side-effect: augments the ambient com.atproto.* XRPC maps
import {
  createAuthorizationUrl,
  finalizeAuthorization,
  getSession,
  listStoredSessions,
  OAuthUserAgent,
  type Session,
} from "@atcute/oauth-browser-client";
import { Client } from "@atcute/client";
import type { ActorIdentifier } from "@atcute/lexicons";
import { consola } from "consola";
import { OAUTH_SCOPE, configureAtradioOAuth } from "./client";

export type { Session };

/** Begin login for a handle/DID — redirects the browser to the PDS. */
export async function startLogin(handle: string): Promise<void> {
  configureAtradioOAuth();
  const identifier = handle.replace(/^@/, "").trim();
  const url = await createAuthorizationUrl({
    target: { type: "account", identifier: identifier as ActorIdentifier },
    scope: OAUTH_SCOPE,
  });
  window.location.assign(url.toString());
}

/** Finalize the OAuth callback (on the /oauth/callback route). */
export async function finishLogin(): Promise<Session> {
  configureAtradioOAuth();
  const params = new URLSearchParams(window.location.search);
  const { session } = await finalizeAuthorization(params);
  return session;
}

/** Restore a previously-stored session (IndexedDB), or null. */
export async function restoreSession(): Promise<Session | null> {
  try {
    configureAtradioOAuth();
    const dids = listStoredSessions();
    if (dids.length === 0) return null;
    return await getSession(dids[0], { allowStale: true });
  } catch (err) {
    consola.warn("[atproto] failed to restore session", err);
    return null;
  }
}

/** Build an authenticated XRPC client for a session. */
export function makeClient(session: Session): Client {
  return new Client({ handler: new OAuthUserAgent(session) });
}

/** Revoke + clear the session server-side and locally. */
export async function endSession(session: Session): Promise<void> {
  try {
    await new OAuthUserAgent(session).signOut();
  } catch (err) {
    consola.warn("[atproto] sign-out error", err);
  }
}
