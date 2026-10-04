import type { Station } from "../types";
export async function stationPage(
	kind: "registered" | "favorites" | "recent" | "mine",
	actor?: string,
	cursor?: string,
	signal?: AbortSignal,
): Promise<{ items: Station[]; cursor?: string; total?: number }> {
	const method = {
		registered: "getRecentStations",
		favorites: "getFavorites",
		recent: "getRecentlyPlayed",
		mine: "getStations",
	}[kind];
	const params = new URLSearchParams({ limit: "100" });
	if (actor) params.set("actor", actor);
	if (cursor) params.set("cursor", cursor);
	const response = await fetch(
		`https://api.atradio.fm/xrpc/fm.atradio.${method}?${params}`,
		{ signal },
	);
	if (!response.ok) throw new Error("Could not load stations. Please retry.");
	const data = await response.json();
	return {
		total: data.total,
		cursor: data.cursor,
		items: (data.items ?? []).flatMap((item: any) => {
			const s = item.station;
			if (!s?.stationId || !/^https?:\/\//.test(s.streamUrl ?? "")) return [];
			return [
				{
					...s,
					id: s.stationId,
					favicon: s.logo,
					source: s.source ?? "custom",
				},
			];
		}),
	};
}
