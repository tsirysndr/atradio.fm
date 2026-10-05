import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { authAtom } from "../state/app";
import { request } from "../auth/client";
import type { Station } from "../types";

export const favoritesKey = (actor?: string) => ["favorites", actor] as const;

export function useFavorites() {
	const auth = useAtomValue(authAtom);
	const actor = auth.state === "signedIn" ? auth.profile?.did : undefined;
	return useQuery({
		queryKey: favoritesKey(actor),
		enabled: !!actor,
		staleTime: Infinity,
		queryFn: async ({ signal }) => {
			const stations = await request<Station[]>(
				"stationAction",
				JSON.stringify({ action: "listFavorites", actor }),
			);
			signal.throwIfAborted();
			return [
				...new Map(stations.map((station) => [station.id, station])).values(),
			];
		},
	});
}
