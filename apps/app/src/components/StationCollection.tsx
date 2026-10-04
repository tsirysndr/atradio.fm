import React, { useState } from "react";
import {
	View,
	Text,
	Pressable,
	TextInput,
	ActivityIndicator,
	ScrollView,
} from "react-native";
import { Image } from "expo-image";
import Feather from "@expo/vector-icons/Feather";
import { useInfiniteQuery } from "@tanstack/react-query";
import { stationPage } from "../api/stations";
import type { Station } from "../types";
import { c } from "../theme";
const tabs = [
	{ key: "favorites", label: "Favorites" },
	{ key: "mine", label: "Registered stations" },
	{ key: "recent", label: "Recently played" },
] as const;
export default function StationCollection({
	actor,
	directory = false,
	onPlay,
	onDiscussion,
	onRegister,
	added = [],
}: {
	actor?: string;
	directory?: boolean;
	onPlay: (s: Station) => void;
	onDiscussion: (s: Station) => void;
	onRegister: () => void;
	added?: Station[];
}) {
	const [tab, setTab] = useState<"favorites" | "mine" | "recent">("favorites");
	const [filter, setFilter] = useState("");
	const kind = directory ? "registered" : tab;
	const result = useInfiniteQuery({
		queryKey: [
			directory ? "registered-stations" : "profile-stations",
			actor,
			kind,
		],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			stationPage(kind, directory ? undefined : actor, pageParam, signal),
		getNextPageParam: (last, _all, cursor) =>
			last.cursor !== cursor ? last.cursor : undefined,
		refetchInterval: 30000,
	});
	const seen = new Set<string>();
	const items = [
		...(directory || tab === "mine" ? added : []),
		...(result.data?.pages.flatMap((page) => page.items) ?? []),
	].filter((station) => {
		if (seen.has(station.id)) return false;
		seen.add(station.id);
		return `${station.name} ${station.genre ?? ""}`
			.toLowerCase()
			.includes(filter.trim().toLowerCase());
	});
	return (
		<View style={{ gap: 16 }}>
			{!directory && (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={{ gap: 18 }}
				>
					{tabs.map((t) => (
						<Pressable
							key={t.key}
							accessibilityRole="tab"
							accessibilityState={{ selected: tab === t.key }}
							onPress={() => {
								setTab(t.key);
								setFilter("");
							}}
							style={{
								paddingVertical: 12,
								borderBottomWidth: 2,
								borderColor: tab === t.key ? c.cyan : "transparent",
							}}
						>
							<Text
								style={{
									color: tab === t.key ? c.cyan : c.muted,
									fontWeight: "700",
								}}
							>
								{t.label}
							</Text>
						</Pressable>
					))}
				</ScrollView>
			)}
			{(directory || tab === "mine") && (
				<Pressable
					onPress={onRegister}
					style={{
						flexDirection: "row",
						gap: 8,
						padding: 12,
						alignItems: "center",
					}}
				>
					<Feather name="plus-circle" color={c.cyan} size={22} />
					<Text style={{ color: c.cyan, fontWeight: "700" }}>
						Register a station
					</Text>
				</Pressable>
			)}
			<TextInput
				accessibilityLabel="Filter stations"
				value={filter}
				onChangeText={setFilter}
				placeholder="Filter stations"
				placeholderTextColor={c.muted}
				style={{
					backgroundColor: c.surface,
					borderRadius: 12,
					padding: 14,
					color: c.text,
				}}
			/>
			{result.isPending && <ActivityIndicator color={c.cyan} />}
			{items.map((station) => (
				<View
					key={station.id}
					style={{
						flexDirection: "row",
						gap: 12,
						alignItems: "center",
						paddingVertical: 10,
						borderBottomWidth: 1,
						borderColor: c.border,
					}}
				>
					<Pressable
						onPress={() => onPlay(station)}
						accessibilityLabel={`Listen to ${station.name}`}
						style={{
							flex: 1,
							flexDirection: "row",
							alignItems: "center",
							gap: 12,
						}}
					>
						{station.favicon ? (
							<Image
								source={station.favicon}
								style={{ width: 48, height: 48, borderRadius: 10 }}
							/>
						) : (
							<Feather name="radio" size={36} color={c.cyan} />
						)}
						<View style={{ flex: 1 }}>
							<Text
								numberOfLines={2}
								style={{ color: c.text, fontWeight: "700" }}
							>
								{station.name}
							</Text>
							<Text numberOfLines={1} style={{ color: c.muted, marginTop: 5 }}>
								{station.genre || station.country || "Live radio"}
							</Text>
						</View>
						<Feather name="play-circle" size={24} color={c.cyan} />
					</Pressable>
					<Pressable
						onPress={() => onDiscussion(station)}
						accessibilityLabel={`Comments for ${station.name}`}
						style={{ padding: 10 }}
					>
						<Feather name="message-circle" size={22} color={c.muted} />
					</Pressable>
				</View>
			))}
			{!result.isPending && !result.isError && items.length === 0 && (
				<Text style={{ color: c.muted }}>No stations found.</Text>
			)}
			{result.isError && (
				<Pressable
					onPress={() =>
						void (result.isFetchNextPageError
							? result.fetchNextPage()
							: result.refetch())
					}
				>
					<Text style={{ color: c.cyan }}>
						Could not load stations. Tap to retry.
					</Text>
				</Pressable>
			)}
			{result.hasNextPage && (
				<Pressable
					disabled={result.isFetchingNextPage}
					onPress={() => void result.fetchNextPage()}
					style={{ padding: 16 }}
				>
					{result.isFetchingNextPage ? (
						<ActivityIndicator color={c.cyan} />
					) : (
						<Text style={{ color: c.cyan, textAlign: "center" }}>
							Load more stations
						</Text>
					)}
				</Pressable>
			)}
		</View>
	);
}
