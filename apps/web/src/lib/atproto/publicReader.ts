import { Client, simpleFetchHandler } from "@atcute/client";
import type { Did } from "@atcute/lexicons";
import { resolveActor } from "./resolver";
import { listFavorites, listStations, type StoredStation } from "./records";

export interface PublicUser {
  did: Did;
  handle: string;
  favorites: StoredStation[];
  stations: StoredStation[];
}

/**
 * Read any user's atradio records straight from their PDS (public, no auth).
 * `com.atproto.repo.listRecords` is a public endpoint, so this works for any
 * actor and keeps the profile page independent of our AppView being online.
 */
export async function readPublicUser(actor: string): Promise<PublicUser> {
  const resolved = await resolveActor(actor);
  const did = resolved.did as Did;
  const client = new Client({
    handler: simpleFetchHandler({ service: resolved.pds }),
  });
  const [favorites, stations] = await Promise.all([
    listFavorites(client, did),
    listStations(client, did),
  ]);
  return { did, handle: resolved.handle, favorites, stations };
}
