import type { Station } from "../types";
export type RecentPlay = {
	station: Station;
	playedAt: string;
	actor?: {
		did: string;
		handle?: string;
		displayName?: string;
		avatar?: string;
	};
};
export async function recentlyPlayed(
	cursor?: string,
	signal?: AbortSignal,
): Promise<{ items: RecentPlay[]; cursor?: string }> {
	const params = new URLSearchParams({ limit: "30" });
	if (cursor) params.set("cursor", cursor);
	const response = await fetch(
		`https://api.atradio.fm/xrpc/fm.atradio.getGlobalRecentlyPlayed?${params}`,
		{ signal },
	);
	if (!response.ok)
		throw new Error("Recently played stations are unavailable.");
	const data = await response.json();
	return {
		cursor: typeof data.cursor === "string" ? data.cursor : undefined,
		items: (data.items ?? []).flatMap((item: any) => {
			const station = item.station;
			if (!station?.stationId || !/^https?:\/\//.test(station.streamUrl ?? ""))
				return [];
			return [
				{
					...item,
					station: {
						...station,
						id: station.stationId,
						favicon: station.logo,
						source: station.source ?? "custom",
					},
				},
			];
		}),
	};
}
export function timeAgo(value: string) {
	const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
	if (!Number.isFinite(seconds)) return "";
	if (seconds < 60) return "Just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}
