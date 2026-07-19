import type { Client } from "@atcute/client";
import type { Did } from "@atcute/lexicons";
import { AtradioAgent } from "@atradio/sdk";
import type {
  AudioSettingsData,
  AudioSettingsRecord,
  GifEmbed,
  Mention,
  Station,
  StationDraft,
} from "@atradio/lexicons";

// The atradio.fm record layer now lives in the official SDK (`@atradio/sdk`).
// This module is a thin facade that adapts the app's `(client, did, …)` call
// convention to an `AtradioAgent`, so callers didn't have to change. New code
// can use the `agentAtom` directly instead.

export { favoriteRkey } from "@atradio/sdk";
export type { StoredStation } from "@atradio/sdk";

const agent = (client: Client, did: Did) => AtradioAgent.fromClient(client, did);

export function listFavorites(client: Client, did: Did) {
  return agent(client, did).listFavorites();
}

export function listStations(client: Client, did: Did) {
  return agent(client, did).listStations();
}

export function putStation(client: Client, did: Did, draft: StationDraft) {
  return agent(client, did).createStation(draft);
}

export function deleteAtradioRecord(
  client: Client,
  did: Did,
  collection: string,
  rkey: string,
) {
  return agent(client, did).deleteRecord(collection, rkey);
}

/** The actor's singleton audio-settings record, or null when absent/invalid. */
export function getAudioSettings(
  client: Client,
  did: Did,
): Promise<AudioSettingsRecord | null> {
  return agent(client, did).getAudioSettingsRecord();
}

export function putAudioSettings(
  client: Client,
  did: Did,
  settings: AudioSettingsData,
) {
  return agent(client, did).putAudioSettings(settings);
}

export function putActorStatus(client: Client, did: Did, station: Station) {
  return agent(client, did).setPlayStatus(station);
}

export function deleteActorStatus(client: Client, did: Did) {
  return agent(client, did).deletePlayStatus();
}

/** Write a comment; returns its rkey + uri. */
export async function putComment(
  client: Client,
  did: Did,
  station: Station,
  text: string,
  opts: { facets?: Mention[]; gif?: GifEmbed } = {},
): Promise<{ rkey: string; uri: string }> {
  const uri = await agent(client, did).comment(station, text, opts);
  return { rkey: uri.slice(uri.lastIndexOf("/") + 1), uri };
}

export function updateComment(
  client: Client,
  did: Did,
  uri: string,
  station: Station,
  text: string,
  opts: { facets?: Mention[]; gif?: GifEmbed; createdAt?: string } = {},
) {
  return agent(client, did).updateComment(uri, station, text, opts);
}

export function deleteComment(client: Client, did: Did, uri: string) {
  return agent(client, did).deleteComment(uri);
}

/** Write an emoji reaction to a station; returns its rkey. */
export async function putReaction(
  client: Client,
  did: Did,
  station: Station,
  emoji: string,
): Promise<string> {
  const uri = await agent(client, did).reaction(station, emoji);
  return uri.slice(uri.lastIndexOf("/") + 1);
}
