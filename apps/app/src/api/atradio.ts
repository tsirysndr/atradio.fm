import type { Station } from "../types";
const BASE = "https://api.atradio.fm";
export async function appviewStations(
  kind: "popular" | "recent" | "favorites",
  actor?: string,
  signal?: AbortSignal,
): Promise<Station[]> {
  const nsid = {
    popular: "getPopularStations",
    recent: "getRecentStations",
    favorites: "getFavorites",
  }[kind];
  const params = new URLSearchParams({ limit: "60" });
  if (actor) params.set("actor", actor);
  const res = await fetch(`${BASE}/xrpc/fm.atradio.${nsid}?${params}`, {
    signal,
  });
  if (!res.ok) throw new Error("Could not reach atradio.fm. Please retry.");
  const data = await res.json();
  return (data.items ?? []).flatMap((item: any) => {
    const s = item.station;
    if (!s || !/^https?:\/\//.test(s.streamUrl ?? "")) return [];
    return [
      { ...s, id: s.stationId, favicon: s.logo, source: s.source ?? "custom" },
    ];
  });
}
export async function profile(did: string) {
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
  );
  if (!res.ok) throw new Error("Profile unavailable");
  return (await res.json()) as {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}
