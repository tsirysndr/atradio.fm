import type { ListenerCountsOutput } from "@atradio/lexicons";

export async function listenerCount(
	stationId: string,
	signal?: AbortSignal,
): Promise<number> {
	const params = new URLSearchParams({ stations: stationId });
	const response = await fetch(
		`https://api.atradio.fm/xrpc/fm.atradio.getListenerCounts?${params}`,
		{ signal, headers: { Accept: "application/json" } },
	);
	if (!response.ok) throw new Error("Listener count unavailable");
	const data = (await response.json()) as ListenerCountsOutput;
	const count =
		data.counts.find((item) => item.stationId === stationId)?.listeners ?? 0;
	return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}
