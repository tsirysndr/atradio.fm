import React, { useEffect, useRef, useState } from "react";
import {
	View,
	Text,
	Pressable,
	TextInput,
	FlatList,
	ScrollView,
	KeyboardAvoidingView,
	Platform,
	ActivityIndicator,
	Alert,
	StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import Feather from "@expo/vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery, useMutation } from "@tanstack/react-query";
import type { CommentView, GifEmbed } from "@atradio/lexicons";
import { request } from "../auth/client";
import { searchMedia, KLIPY_ENABLED } from "../api/klipy";
import { timeAgo } from "../api/recent";
import type { Station } from "../types";
import { c } from "../theme";
const emojis = [
	"❤️",
	"🔥",
	"🎶",
	"🎵",
	"🎧",
	"🎸",
	"🎹",
	"🥁",
	"🎤",
	"🕺",
	"💃",
	"🙌",
	"👏",
	"🤯",
	"😂",
];
export default function StationDiscussion({
	station,
	did,
	handle,
	avatar,
	onClose,
	onSignIn,
}: {
	station: Station;
	did?: string;
	handle?: string;
	avatar?: string;
	onClose: () => void;
	onSignIn: () => void;
}) {
	const inset = useSafeAreaInsets();
	const [text, setText] = useState("");
	const [gif, setGif] = useState<GifEmbed>();
	const [picker, setPicker] = useState(false);
	const [search, setSearch] = useState("");
	const [debounced, setDebounced] = useState("");
	const [type, setType] = useState<"gifs" | "stickers">("gifs");
	const [pending, setPending] = useState(false);
	const sending = useRef(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [local, setLocal] = useState<CommentView[]>([]);
	const [deleted, setDeleted] = useState(new Set<string>());
	useEffect(() => {
		const t = setTimeout(() => setDebounced(search), 300);
		return () => clearTimeout(t);
	}, [search]);
	const feed = useInfiniteQuery({
		queryKey: ["comments", station.id],
		initialPageParam: undefined as string | undefined,
		queryFn: async ({ pageParam, signal }) => {
			const params = new URLSearchParams({ station: station.id, limit: "30" });
			if (pageParam) params.set("cursor", pageParam);
			const res = await fetch(
				`https://api.atradio.fm/xrpc/fm.atradio.getComments?${params}`,
				{ signal },
			);
			if (!res.ok) throw new Error("Could not load comments.");
			return (await res.json()) as {
				items: CommentView[];
				cursor?: string;
				total: number;
			};
		},
		getNextPageParam: (page, _all, cursor) =>
			page.cursor !== cursor ? page.cursor : undefined,
		refetchInterval: 15000,
	});
	const media = useQuery({
		queryKey: ["klipy", type, debounced],
		queryFn: ({ signal }) => searchMedia(type, debounced, 30, signal),
		enabled: picker && KLIPY_ENABLED,
	});
	const seen = new Set<string>();
	const comments = [
		...local,
		...(feed.data?.pages.flatMap((p) => p.items) ?? []),
	].filter((item) => {
		if (seen.has(item.uri) || deleted.has(item.uri)) return false;
		seen.add(item.uri);
		return true;
	});
	const mutation = useMutation({
		mutationFn: ({ action, payload }: { action: string; payload: object }) =>
			request<{ uri: string }>(
				"stationAction",
				JSON.stringify({ action, station, ...payload }),
			),
		retry: false,
	});
	async function write(action: string, payload: object) {
		if (!did) {
			onSignIn();
			return;
		}
		if (sending.current) return;
		sending.current = true;
		setPending(true);
		setError("");
		setNotice("");
		try {
			return await mutation.mutateAsync({ action, payload });
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Could not save. Please retry.",
			);
		} finally {
			sending.current = false;
			setPending(false);
		}
	}
	const send = async () => {
		const result = await write("comment", { text, gif });
		if (!result) return;
		setLocal((items) => [
			{
				uri: result.uri,
				text: text.trim(),
				gif,
				station: { ...station, stationId: station.id },
				author: { did: did!, handle, avatar },
				createdAt: new Date().toISOString(),
			},
			...items,
		]);
		setText("");
		setGif(undefined);
		setPicker(false);
		setNotice("Comment posted");
		void feed.refetch();
	};
	return (
		<KeyboardAvoidingView
			style={{
				flex: 1,
				backgroundColor: c.bg,
				paddingTop: inset.top,
				paddingBottom: inset.bottom,
			}}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
		>
			<View style={s.header}>
				<Pressable
					onPress={onClose}
					accessibilityLabel="Close comments"
					style={s.icon}
				>
					<Feather name="chevron-down" size={26} color={c.text} />
				</Pressable>
				<View style={{ flex: 1 }}>
					<Text style={s.title}>Comments & reactions</Text>
					<Text numberOfLines={1} style={s.muted}>
						{station.name}
					</Text>
				</View>
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flexGrow: 0, maxHeight: 64 }}
				contentContainerStyle={{ paddingHorizontal: 16, alignItems: "center" }}
			>
				{emojis.map((emoji) => (
					<Pressable
						key={emoji}
						disabled={pending}
						accessibilityLabel={`React ${emoji}`}
						onPress={async () => {
							const result = await write("reaction", { emoji });
							if (result) setNotice(`${emoji} Reaction sent`);
						}}
						style={s.icon}
					>
						<Text style={{ fontSize: 28 }}>{emoji}</Text>
					</Pressable>
				))}
			</ScrollView>
			{!!error && (
				<Text accessibilityRole="alert" style={{ color: c.error, padding: 16 }}>
					{error}
				</Text>
			)}
			{!!notice && (
				<Text
					accessibilityLiveRegion="polite"
					style={{ color: c.cyan, paddingHorizontal: 16, paddingVertical: 6 }}
				>
					{notice}
				</Text>
			)}
			{picker ? (
				<View style={{ flex: 1, paddingHorizontal: 16, gap: 10 }}>
					<View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
						<TextInput
							placeholder="Search KLIPY"
							placeholderTextColor={c.muted}
							value={search}
							onChangeText={setSearch}
							style={[s.input, { flex: 1 }]}
							autoCorrect={false}
						/>
						<Pressable
							accessibilityLabel="Close GIF picker"
							onPress={() => setPicker(false)}
							style={s.icon}
						>
							<Feather name="x" size={24} color={c.text} />
						</Pressable>
					</View>
					<View style={{ flexDirection: "row", gap: 18 }}>
						{(["gifs", "stickers"] as const).map((t) => (
							<Pressable key={t} onPress={() => setType(t)}>
								<Text style={{ color: type === t ? c.cyan : c.muted }}>
									{t === "gifs" ? "GIFs" : "Stickers"}
								</Text>
							</Pressable>
						))}
					</View>
					{!KLIPY_ENABLED ? (
						<Text style={s.muted}>GIF search is not configured.</Text>
					) : media.isPending ? (
						<ActivityIndicator color={c.cyan} />
					) : media.isError ? (
						<Pressable onPress={() => void media.refetch()}>
							<Text style={{ color: c.cyan }}>
								Could not load GIFs. Tap to retry.
							</Text>
						</Pressable>
					) : null}
					<FlatList
						data={media.data ?? []}
						numColumns={2}
						keyboardShouldPersistTaps="handled"
						keyExtractor={(item) => item.id}
						columnWrapperStyle={{ gap: 8 }}
						renderItem={({ item }) => (
							<Pressable
								accessibilityLabel={item.alt || "Select GIF"}
								style={{ flex: 1, height: 130, marginBottom: 8 }}
								onPress={() => {
									const { id, isVideo, ...embed } = item;
									setGif(embed);
									setPicker(false);
								}}
							>
								<Image
									source={item.previewUrl || item.url}
									style={{ width: "100%", height: "100%", borderRadius: 10 }}
									contentFit="cover"
								/>
							</Pressable>
						)}
						ListEmptyComponent={
							!media.isPending && !media.isError ? (
								<Text style={s.muted}>No results. Try another search.</Text>
							) : null
						}
					/>
					<Text style={[s.muted, { textAlign: "center", paddingBottom: 8 }]}>
						Powered by KLIPY
					</Text>
				</View>
			) : (
				<FlatList
					data={comments}
					contentContainerStyle={{ padding: 16, gap: 20, flexGrow: 1 }}
					keyExtractor={(item) => item.uri}
					keyboardShouldPersistTaps="handled"
					onEndReached={() => {
						if (
							feed.hasNextPage &&
							!feed.isFetchingNextPage &&
							!feed.isFetchNextPageError
						)
							void feed.fetchNextPage();
					}}
					onEndReachedThreshold={0.5}
					refreshing={feed.isRefetching}
					onRefresh={() => void feed.refetch()}
					renderItem={({ item }) => (
						<View style={{ flexDirection: "row", gap: 10 }}>
							{item.author?.avatar ? (
								<Image
									source={item.author.avatar}
									style={{ width: 34, height: 34, borderRadius: 17 }}
								/>
							) : (
								<Feather name="user" size={28} color={c.muted} />
							)}
							<View style={{ flex: 1, gap: 7 }}>
								<View style={{ flexDirection: "row", gap: 8 }}>
									<Text
										numberOfLines={1}
										style={{ color: c.text, fontWeight: "700", flex: 1 }}
									>
										{item.author?.handle
											? `@${item.author.handle}`
											: item.author?.displayName || "A listener"}
									</Text>
									<Text style={[s.muted, { fontSize: 11 }]}>
										{timeAgo(item.createdAt)}
									</Text>
									{did && item.author?.did === did && (
										<Pressable
											disabled={pending}
											accessibilityLabel="Delete comment"
											onPress={() =>
												Alert.alert(
													"Delete comment?",
													"This removes your comment from your account.",
													[
														{ text: "Cancel", style: "cancel" },
														{
															text: "Delete",
															style: "destructive",
															onPress: async () => {
																const result = await write("deleteComment", {
																	uri: item.uri,
																});
																if (result)
																	setDeleted(
																		(old) => new Set([...old, item.uri]),
																	);
															},
														},
													],
												)
											}
										>
											<Feather name="trash-2" size={18} color={c.muted} />
										</Pressable>
									)}
								</View>
								{!!item.text && (
									<Text style={{ color: c.text, lineHeight: 22 }}>
										{item.text}
									</Text>
								)}
								{item.gif && (
									<Image
										source={
											/\.mp4(?:\?|$)/i.test(item.gif.url)
												? item.gif.previewUrl
												: item.gif.url
										}
										accessibilityLabel={item.gif.alt || "GIF attachment"}
										style={{ width: "100%", height: 180, borderRadius: 12 }}
										contentFit="contain"
									/>
								)}
							</View>
						</View>
					)}
					ListEmptyComponent={
						feed.isPending ? (
							<ActivityIndicator color={c.cyan} />
						) : !feed.isError ? (
							<Text style={s.muted}>
								Start the conversation about this station.
							</Text>
						) : null
					}
					ListFooterComponent={
						feed.isError ? (
							<Pressable
								onPress={() =>
									void (feed.isFetchNextPageError
										? feed.fetchNextPage()
										: feed.refetch())
								}
							>
								<Text style={{ color: c.cyan }}>
									Could not load comments. Tap to retry.
								</Text>
							</Pressable>
						) : feed.isFetchingNextPage ? (
							<ActivityIndicator color={c.cyan} />
						) : null
					}
				/>
			)}
			{did ? (
				<View
					style={{
						padding: 16,
						borderTopWidth: 1,
						borderColor: c.border,
						gap: 10,
					}}
				>
					{gif && (
						<View
							style={{ flexDirection: "row", gap: 14, alignItems: "center" }}
						>
							<Image
								source={gif.previewUrl || gif.url}
								style={{ width: 72, height: 60, borderRadius: 8 }}
							/>
							<Pressable
								accessibilityLabel="Remove GIF"
								onPress={() => setGif(undefined)}
							>
								<Feather name="x" size={22} color={c.muted} />
							</Pressable>
						</View>
					)}
					<TextInput
						value={text}
						onChangeText={setText}
						placeholder="Write a comment…"
						placeholderTextColor={c.muted}
						style={[s.input, { maxHeight: 120 }]}
						multiline
						maxLength={1000}
						editable={!pending}
					/>
					<View style={{ flexDirection: "row", alignItems: "center", gap: 15 }}>
						<Pressable
							accessibilityLabel="Add GIF"
							onPress={() => setPicker(!picker)}
							disabled={pending}
						>
							<Text style={{ color: c.cyan, fontWeight: "800", padding: 8 }}>
								GIF
							</Text>
						</Pressable>
						<Text style={[s.muted, { flex: 1 }]}>{text.length}/1,000</Text>
						<Pressable
							disabled={pending || (!text.trim() && !gif)}
							onPress={() => void send()}
							style={[
								s.button,
								(pending || (!text.trim() && !gif)) && { opacity: 0.4 },
							]}
						>
							{pending ? (
								<ActivityIndicator color={c.bg} />
							) : (
								<Text style={{ color: c.bg, fontWeight: "800" }}>Post</Text>
							)}
						</Pressable>
					</View>
				</View>
			) : (
				<Pressable onPress={onSignIn} style={[s.button, { margin: 16 }]}>
					<Text style={{ color: c.bg, fontWeight: "800" }}>
						Sign in to comment or react
					</Text>
				</Pressable>
			)}
		</KeyboardAvoidingView>
	);
}
const s = StyleSheet.create({
	header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
	title: { fontSize: 20, color: c.text, fontWeight: "800" },
	muted: { color: c.muted, fontSize: 13 },
	icon: { padding: 10 },
	input: {
		backgroundColor: c.surface,
		borderColor: c.border,
		borderWidth: 1,
		borderRadius: 12,
		color: c.text,
		fontSize: 16,
		padding: 12,
	},
	button: {
		paddingHorizontal: 22,
		paddingVertical: 12,
		alignItems: "center",
		backgroundColor: c.cyan,
		borderRadius: 12,
	},
});
