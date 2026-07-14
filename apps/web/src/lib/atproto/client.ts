import { configureOAuth } from "@atcute/oauth-browser-client";
import { actorResolver } from "./resolver";

/**
 * `transition:generic` grants broad repo read/write today and is the most
 * widely-supported scope; combined with `atproto` it lets us read/write our
 * `fm.atradio.*` records in the user's PDS.
 */
export const OAUTH_SCOPE = "atproto transition:generic";

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
