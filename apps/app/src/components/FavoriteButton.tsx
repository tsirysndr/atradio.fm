import React from "react";
import { Alert, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { atom, useAtomValue, useStore } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import {
	authAtom,
	loginAtom,
	playerExpandedAtom,
	directoryOpenAtom,
} from "../state/app";
import { favoritesKey, useFavorites } from "../hooks/useFavorites";
import { request } from "../auth/client";
import type { Station } from "../types";
import { c } from "../theme";

const pendingAtom = atom(new Set<string>());

export default function FavoriteButton({
	station,
	size = 22,
}: {
	station: Station;
	size?: number;
}) {
	const auth = useAtomValue(authAtom);
	const pending = useAtomValue(pendingAtom);
	const store = useStore();
	const client = useQueryClient();
	const favorites = useFavorites();
	const actor = auth.state === "signedIn" ? auth.profile?.did : undefined;
	const key = `${actor}:${station.id}`;
	const selected =
		!!actor && !!favorites.data?.some((item) => item.id === station.id);
	const busy = pending.has(key);
	const toggle = async () => {
		if (!actor || !auth.canFavorite) {
			store.set(playerExpandedAtom, false);
			store.set(directoryOpenAtom, false);
			store.set(loginAtom, true);
			return;
		}
		if (store.get(pendingAtom).has(key)) return;
		if (!favorites.isSuccess) {
			void favorites.refetch();
			Alert.alert(
				"Favorites unavailable",
				"Loading your saved stations. Please try again in a moment.",
			);
			return;
		}
		store.set(pendingAtom, (old) => new Set(old).add(key));
		const queryKey = favoritesKey(actor);
		await client.cancelQueries({ queryKey, exact: true });
		const previous = client.getQueryData<Station[]>(queryKey) ?? [];
		const existing = previous.find((item) => item.id === station.id);
		const apply = (old: Station[] = []) => {
			const rest = old.filter((item) => item.id !== station.id);
			return existing ? rest : [station, ...rest];
		};
		client.setQueryData<Station[]>(queryKey, apply);
		try {
			await request(
				"stationAction",
				JSON.stringify({
					action: existing ? "unfavorite" : "favorite",
					actor,
					station,
				}),
			);
			// A pull-to-refresh during the write may have read the old repo state.
			await client.cancelQueries({ queryKey, exact: true });
			client.setQueryData<Station[]>(queryKey, apply);
		} catch (error) {
			// Only restore this station: other stations may have changed meanwhile.
			client.setQueryData<Station[]>(queryKey, (old = []) => {
				const rest = old.filter((item) => item.id !== station.id);
				if (existing)
					rest.splice(Math.min(previous.indexOf(existing), rest.length), 0, existing);
				return rest;
			});
			Alert.alert(
				"Could not update favorite",
				error instanceof Error ? error.message : "Please try again.",
			);
		} finally {
			store.set(pendingAtom, (old) => {
				const next = new Set(old);
				next.delete(key);
				return next;
			});
		}
	};
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${selected ? "Remove" : "Add"} ${station.name} ${selected ? "from" : "to"} favorites`}
			accessibilityState={{ selected, disabled: busy, busy }}
			disabled={busy}
			onPress={(event) => {
				event.stopPropagation();
				void toggle();
			}}
			style={{
				width: 44,
				height: 44,
				borderRadius: 22,
				alignItems: "center",
				justifyContent: "center",
				opacity: busy ? 0.5 : 1,
				backgroundColor: selected ? `${c.pink}20` : "transparent",
			}}
		>
			<Ionicons
				name={selected ? "heart" : "heart-outline"}
				size={size}
				color={selected ? c.pink : c.muted}
			/>
		</Pressable>
	);
}
