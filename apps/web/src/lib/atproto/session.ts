import "@atcute/atproto"; // side-effect: augments the ambient com.atproto.* XRPC maps
import {
  createAuthorizationUrl,
  deleteStoredSession,
  finalizeAuthorization,
  getSession,
  listStoredSessions,
  OAuthUserAgent,
  TokenRefreshError,
  type Session,
} from "@atcute/oauth-browser-client";
import { Client } from "@atcute/client";
import type { ActorIdentifier, Did } from "@atcute/lexicons";
import { consola } from "consola";
import { OAUTH_SCOPE, configureAtradioOAuth } from "./client";

export type { Session };

/** The Bluesky entryway PDS used for new-account signup. */
const BLUESKY_PDS = "https://bsky.social";

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

/**
 * Begin signup on Bluesky — redirects to the bsky.social OAuth authorize flow in
 * account-creation mode (`prompt=create`). After creating the account the user
 * lands back on atradio.fm already authenticated.
 */
export async function startSignup(): Promise<void> {
  configureAtradioOAuth();
  const url = await createAuthorizationUrl({
    target: { type: "pds", serviceUrl: BLUESKY_PDS },
    scope: OAUTH_SCOPE,
    prompt: "create",
  });
  window.location.assign(url.toString());
}

/** Finalize the OAuth callback (on the /oauth/callback route). */
export async function finishLogin(): Promise<Session> {
  configureAtradioOAuth();
  // AT Proto returns the code/state/iss in the URL fragment (response_mode=
  // fragment); fall back to the query string just in case.
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const params = hash.has("code") || hash.has("state")
    ? hash
    : new URLSearchParams(window.location.search);
  const { session } = await finalizeAuthorization(params);
  return session;
}

/**
 * Restore a previously-stored session (IndexedDB), or null.
 *
 * We deliberately validate + refresh the token here rather than accepting a
 * stale one. A session whose refresh token has expired can no longer mint the
 * service-auth JWTs that authenticate writes and the Connect WebSocket, so a
 * stale session silently breaks device discovery while still *looking* logged
 * in. When the refresh fails for good (`TokenRefreshError`) we drop the stored
 * session and return null so the user is prompted to sign in again — a dead
 * session never masquerades as authenticated. A transient network error falls
 * back to the stale session so offline use still works; the Connect client's
 * auth-error handling surfaces a re-login prompt if it turns out to be dead.
 */
export async function restoreSession(): Promise<Session | null> {
  configureAtradioOAuth();
  let dids: ReturnType<typeof listStoredSessions>;
  try {
    dids = listStoredSessions();
  } catch (err) {
    consola.warn("[atproto] failed to list stored sessions", err);
    return null;
  }
  if (dids.length === 0) return null;

  try {
    // allowStale defaults to false: refreshes an expired token, throwing if the
    // refresh token itself is dead.
    return await getSession(dids[0]);
  } catch (err) {
    if (err instanceof TokenRefreshError) {
      consola.warn("[atproto] session refresh token expired — signing out", err);
      try {
        deleteStoredSession(dids[0]);
      } catch {
        /* best-effort cleanup */
      }
      return null;
    }
    // Likely a transient/offline error — keep the user logged in with the stale
    // session; runtime auth-error handling will prompt re-login if it's dead.
    consola.warn("[atproto] session refresh failed; using stale session", err);
    try {
      return await getSession(dids[0], { allowStale: true });
    } catch (staleErr) {
      consola.warn("[atproto] failed to restore session", staleErr);
      return null;
    }
  }
}

/**
 * Force the stored session's token to roll forward, returning the fresh session.
 *
 * `getSession` (allowStale defaults to false) refreshes when the access token
 * has under a minute left, rotating the refresh token and pushing the session's
 * lifetime out. Returns null when the refresh token is dead (`TokenRefreshError`)
 * — the stored session is dropped so the caller can prompt a re-login. Transient
 * errors are re-thrown so the caller can retry without signing the user out.
 */
export async function refreshSession(did: Did): Promise<Session | null> {
  configureAtradioOAuth();
  try {
    return await getSession(did);
  } catch (err) {
    if (err instanceof TokenRefreshError) {
      try {
        deleteStoredSession(did);
      } catch {
        /* best-effort cleanup */
      }
      return null;
    }
    throw err;
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
