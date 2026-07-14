export interface ProfileData {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

/** Resolve a DID or handle to a profile via the public Bluesky AppView. */
export async function getProfile(actor: string): Promise<ProfileData | null> {
  try {
    const res = await fetch(
      "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=" +
        encodeURIComponent(actor),
    );
    if (!res.ok) return null;
    const d = (await res.json()) as ProfileData;
    return {
      did: d.did,
      handle: d.handle,
      displayName: d.displayName,
      avatar: d.avatar,
      description: d.description,
    };
  } catch {
    return null;
  }
}

/** Resolve an actor (DID or handle) to a DID; returns null if unresolvable. */
export async function resolveDid(actor: string): Promise<string | null> {
  if (actor.startsWith("did:")) return actor;
  const profile = await getProfile(actor);
  return profile?.did ?? null;
}
