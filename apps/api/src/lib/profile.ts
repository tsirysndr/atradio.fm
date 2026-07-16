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

/**
 * Batch-resolve up to 25 actors (DID or handle) via app.bsky.actor.getProfiles.
 * Only actors the AppView could resolve come back, so the result may be shorter
 * than the input — callers must key by the returned `did`/`handle`, never by
 * input position.
 */
export async function getProfiles(actors: string[]): Promise<ProfileData[]> {
  if (actors.length === 0) return [];
  try {
    const params = new URLSearchParams();
    for (const a of actors.slice(0, 25)) params.append("actors", a);
    const res = await fetch(
      "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?" + params,
    );
    if (!res.ok) return [];
    const d = (await res.json()) as { profiles?: ProfileData[] };
    return (d.profiles ?? []).map((p) => ({
      did: p.did,
      handle: p.handle,
      displayName: p.displayName,
      avatar: p.avatar,
      description: p.description,
    }));
  } catch {
    return [];
  }
}

/** Resolve an actor (DID or handle) to a DID; returns null if unresolvable. */
export async function resolveDid(actor: string): Promise<string | null> {
  if (actor.startsWith("did:")) return actor;
  const profile = await getProfile(actor);
  return profile?.did ?? null;
}
