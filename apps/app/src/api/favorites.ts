import { request } from "../auth/client";
import type { Station } from "../types";

export async function loadFavorites(actor: string, signal: AbortSignal) {
	const stations = await request<Station[]>(
		"stationAction",
		JSON.stringify({ action: "listFavorites", actor }),
	);
	// React Native's AbortSignal polyfill only exposes `aborted`.
	if (signal.aborted) {
		const error = new Error("Favorites loading canceled.");
		error.name = "AbortError";
		throw error;
	}
	return [...new Map(stations.map((station) => [station.id, station])).values()];
}
