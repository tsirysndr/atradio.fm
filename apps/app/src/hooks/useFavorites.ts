import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { authAtom } from "../state/app";
import { loadFavorites } from "../api/favorites";

export const favoritesKey = (actor?: string) => ["favorites", actor] as const;

export function useFavorites() {
	const auth = useAtomValue(authAtom);
	const actor = auth.state === "signedIn" ? auth.profile?.did : undefined;
	return useQuery({
		queryKey: favoritesKey(actor),
		enabled: !!actor,
		staleTime: Infinity,
		queryFn: ({ signal }) => loadFavorites(actor!, signal),
	});
}
