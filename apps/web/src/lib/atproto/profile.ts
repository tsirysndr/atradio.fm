export interface ActorProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

/**
 * Fetch a public profile (display name / handle / avatar) from the unauthenticated
 * Bluesky AppView. Plain fetch keeps us off the `@atcute/bluesky` lexicon dep.
 */
export async function getProfile(actor: string): Promise<ActorProfile> {
  const url =
    "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=" +
    encodeURIComponent(actor);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`getProfile ${res.status}`);
  const d = (await res.json()) as {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    description?: string;
  };
  return {
    did: d.did,
    handle: d.handle,
    displayName: d.displayName,
    avatar: d.avatar,
    description: d.description,
  };
}
