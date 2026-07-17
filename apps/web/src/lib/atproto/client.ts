import { configureOAuth } from "@atcute/oauth-browser-client";
import { NSID } from "@atradio/lexicons";
import { CONNECT_LXM, CONNECT_SERVICE_AUD } from "@/lib/connect/protocol";
import { actorResolver } from "./resolver";

/** The full `rpc:` scope token that lets the session mint the Connect token. */
export const CONNECT_RPC_SCOPE = `rpc:${CONNECT_LXM}?aud=${CONNECT_SERVICE_AUD}`;

/**
 * Request the minimum needed: `atproto` (base), granular `repo:` write
 * permissions for exactly our `fm.atradio.*` collections, and an `rpc:` scope so
 * the session can mint the atproto service-auth token that authenticates the
 * atradio Connect WebSocket (`com.atproto.server.getServiceAuth`). Record reads
 * are public in AT Proto, so `repo:<nsid>` effectively grants read+write for our
 * own data without asking for broad access to the whole repo.
 *
 * IMPORTANT: keep this in sync with the `scope` field in
 * `public/client-metadata.json` — the authorization server rejects any scope
 * requested here that isn't also declared there (`invalid_scope`). The `rpc:`
 * audience MUST be a `did#serviceId` reference (bare DID is rejected).
 */
export const OAUTH_SCOPE = `atproto repo:${NSID.favorite} repo:${NSID.station} repo:${NSID.audioSettings} repo:${NSID.actorStatus} repo:${NSID.comment} repo:${NSID.reaction} ${CONNECT_RPC_SCOPE}`;

/** Individual scope tokens we request (derived from OAUTH_SCOPE). */
export const REQUIRED_SCOPES = OAUTH_SCOPE.split(/\s+/).filter(Boolean);

/**
 * Scope tokens the current session is missing relative to what the app now
 * requires. A session minted before we added a collection (e.g. comments,
 * reactions) won't carry its `repo:` scope, so the user must re-authenticate to
 * grant it. Returns [] when the granted scope covers everything.
 */
export function missingScopes(grantedScope: string | null | undefined): string[] {
  const granted = new Set((grantedScope ?? "").split(/\s+/).filter(Boolean));
  return REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
}

/** Production origin (client-metadata + redirect must live here). */
const PROD_ORIGIN = "https://atradio.fm";

function appOrigin(): string {
  return import.meta.env.DEV ? window.location.origin : PROD_ORIGIN;
}

export function redirectUri(): string {
  return `${appOrigin()}/oauth/callback`;
}

function clientId(): string {
  if (import.meta.env.DEV) {
    // AT Proto loopback dev client: `client_id` is `http://localhost` with the
    // redirect_uri + scope carried as query params. Open the app at
    // http://127.0.0.1:<port> so the redirect stays on a loopback IP (the spec
    // disallows the `localhost` hostname for redirect URIs).
    const params = new URLSearchParams({
      redirect_uri: redirectUri(),
      scope: OAUTH_SCOPE,
    });
    return `http://localhost?${params.toString()}`;
  }
  return `${appOrigin()}/client-metadata.json`;
}

let configured = false;

/** Configure the atcute browser OAuth client exactly once. */
export function configureAtradioOAuth(): void {
  if (configured) return;
  configured = true;

  configureOAuth({
    metadata: {
      client_id: clientId(),
      redirect_uri: redirectUri(),
    },
    identityResolver: actorResolver,
  });
}
