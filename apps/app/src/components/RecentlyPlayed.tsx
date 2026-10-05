import { Text } from "./Typography";
import React from "react";
import { View, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import Feather from "@expo/vector-icons/Feather";
import { useInfiniteQuery } from "@tanstack/react-query";
import { recentlyPlayed, timeAgo } from "../api/recent";
import type { Station } from "../types";
import StationLoader from "./StationLoader";
import { c } from "../theme";
export default function RecentlyPlayed({
	onPlay,
}: {
	onPlay: (station: Station) => void;
}) {
	const feed = useInfiniteQuery({
		queryKey: ["global-recently-played"],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) => recentlyPlayed(pageParam, signal),
		getNextPageParam: (page, _pages, cursor) =>
			page.cursor !== cursor ? page.cursor : undefined,
		refetchInterval: 30000,
	});
	const seen = new Set<string>();
	const items = (feed.data?.pages.flatMap((page) => page.items) ?? []).filter(
		(item) => {
			const key = `${item.actor?.did}:${item.station.id}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		},
	);
	return (
		<View style={{ marginBottom: 24, gap: 12 }}>
			<Text
				style={{
					color: c.text,
					fontFamily: "Lexend",
					fontSize: 20,
					fontWeight: "800",
				}}
			>
				Recently played on atradio.fm
			</Text>
			<Text style={{ color: c.muted }}>What the community is listening to</Text>
			{feed.isPending ? (
				<StationLoader cards count={3} />
			) : items.length === 0 && !feed.isError ? (
				<Text style={{ color: c.muted }}>No recent plays yet.</Text>
			) : null}
			<FlatList
				horizontal
				data={items}
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{ gap: 12 }}
				keyExtractor={(item) => `${item.actor?.did}:${item.station.id}`}
				onEndReached={() => {
					if (
						feed.hasNextPage &&
						!feed.isFetchingNextPage &&
						!feed.isFetchNextPageError
					)
						void feed.fetchNextPage();
				}}
				onEndReachedThreshold={0.4}
				renderItem={({ item }) => (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={`Listen to ${item.station.name}`}
						onPress={() => onPlay(item.station)}
						style={{
							width: 240,
							padding: 16,
							borderRadius: 18,
							backgroundColor: c.panel,
							gap: 12,
						}}
					>
						<View
							style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
						>
							{item.station.favicon ? (
								<Image
									source={item.station.favicon}
									style={{ width: 48, height: 48, borderRadius: 10 }}
								/>
							) : (
								<Feather name="radio" size={32} color={c.cyan} />
							)}
							<Text
								numberOfLines={2}
								style={{ flex: 1, color: c.text, fontWeight: "700" }}
							>
								{item.station.name}
							</Text>
							<Feather name="play" size={18} color={c.cyan} />
						</View>
						<View
							style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
						>
							{item.actor?.avatar ? (
								<Image
									source={item.actor.avatar}
									style={{ width: 22, height: 22, borderRadius: 11 }}
								/>
							) : (
								<Feather name="user" size={20} color={c.muted} />
							)}
							<Text
								numberOfLines={1}
								style={{
									flex: 1,
									color: c.muted,
									fontSize: 12,
									fontFamily: item.actor?.handle ? "JetBrainsMono" : "Outfit",
								}}
							>
								{item.actor?.handle
									? `@${item.actor.handle}`
									: item.actor?.displayName || "A listener"}
							</Text>
						</View>
						<Text style={{ color: c.muted, fontSize: 12 }}>
							{timeAgo(item.playedAt)}
						</Text>
					</Pressable>
				)}
				ListFooterComponent={
					feed.isFetchingNextPage ? (
						<View style={{ width: 240 }}>
							<StationLoader cards count={1} />
						</View>
					) : null
				}
			/>
			{feed.isError && (
				<Pressable
					onPress={() =>
						void (feed.isFetchNextPageError
							? feed.fetchNextPage()
							: feed.refetch())
					}
				>
					<Text style={{ color: c.cyan }}>
						Could not load recent plays. Tap to retry.
					</Text>
				</Pressable>
			)}
		</View>
	);
}
