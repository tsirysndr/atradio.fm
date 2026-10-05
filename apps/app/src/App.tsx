import { Provider as JotaiProvider, useAtom } from "jotai";
import {
	tabAtom,
	authAtom,
	playerAtom,
	loginAtom,
	playerExpandedAtom,
	equalizerOpenAtom,
	registrationOpenAtom,
	directoryOpenAtom,
	discussionAtom,
	registeredStationsAtom,
	type Tab,
} from "./state/app";
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
	ActivityIndicator,
	Alert,
	AppState,
	FlatList,
	Linking,
	Modal,
	PermissionsAndroid,
	Platform,
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import {
	SafeAreaProvider,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
	QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import Feather from "@expo/vector-icons/Feather";
import { appviewStations, profile } from "./api/atradio";
import { isValidHandle, normalizeHandle } from "./api/handleLookup";
import {
	searchRadioBrowser,
	browseRadioBrowserByTag,
} from "./api/radioBrowser";
import {
	radio,
	nativeAvailable,
	type AuthState,
	type Playback,
} from "./native";
import type { Station } from "./types";
import { genres } from "./genres";
import StationLoader from "./components/StationLoader";
import GenreGrid from "./components/GenreGrid";
import AudioSettingsSync from "./components/AudioSettingsSync";
import Equalizer from "./components/Equalizer";
import RegisterStation from "./components/RegisterStation";
import StationCollection from "./components/StationCollection";
import StationDiscussion from "./components/StationDiscussion";
import SignIn from "./components/SignIn";
import AuthRuntime from "./components/AuthRuntime";
import RecentlyPlayed from "./components/RecentlyPlayed";
import { c } from "./theme";
import { request } from "./auth/client";
import { PlayHistorySync } from "./playback/history";
const client = new QueryClient({
	defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

const icons: Record<Tab, React.ComponentProps<typeof Feather>["name"]> = {
	Discover: "radio",
	Search: "search",
	Library: "heart",
	Profile: "user",
};
function Artwork({ station, size = 58 }: { station: Station; size?: number }) {
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: Math.min(size / 5, 24),
				backgroundColor: c.panel,
				overflow: "hidden",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Feather name="radio" size={size * 0.35} color={c.cyan} />
			{station.favicon && (
				<Image
					source={station.favicon}
					contentFit="cover"
					style={StyleSheet.absoluteFill}
				/>
			)}
		</View>
	);
}
function Main() {
	const insets = useSafeAreaInsets();
	const [tab, setTab] = useAtom(tabAtom);
	const [auth, setAuth] = useAtom(authAtom);
	const [login, setLogin] = useAtom(loginAtom);
	const searchInput = useRef<TextInput>(null);
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");
	const [genre, setGenre] = useState("All");
	const [searchGenre, setSearchGenre] = useState<string | null>(null);
	const [player, setPlayer] = useAtom(playerAtom);
	const [equalizer, setEqualizer] = useAtom(equalizerOpenAtom);
	const [register, setRegister] = useAtom(registrationOpenAtom);
	const [directory, setDirectory] = useAtom(directoryOpenAtom);
	const [added, setAdded] = useAtom(registeredStationsAtom);
	const registerAfterLogin = useRef(false);
	const [discussion, setDiscussion] = useAtom(discussionAtom);
	const [expanded, setExpanded] = useAtom(playerExpandedAtom);
	const [playError, setPlayError] = useState("");
	const [historyError, setHistoryError] = useState("");
	const [refreshingProfile, setRefreshingProfile] = useState(false);
	const profileRefreshBusy = useRef(false);
	const playRequest = useRef<AbortController | null>(null);
	const history = useRef<PlayHistorySync | null>(null);
	if (!history.current)
		history.current = new PlayHistorySync(
			(actor, station) =>
				request(
					"stationAction",
					JSON.stringify({ action: "playStatus", actor, station }),
				),
			() => {
				setHistoryError("");
				void client.invalidateQueries({ queryKey: ["global-recently-played"] });
				void client.invalidateQueries({ queryKey: ["profile-stations"] });
			},
			(error) =>
				setHistoryError(
					`Could not update listening history: ${error instanceof Error ? error.message : String(error)}. Retrying automatically.`,
				),
		);
	const did = auth.state === "signedIn" ? auth.profile?.did : undefined;
	useEffect(() => {
		history.current?.update(
			auth.canPublishPlays ? did : undefined,
			player.state,
			player.station,
		);
	}, [auth.canPublishPlays, did, player]);
	useEffect(() => {
		setHistoryError("");
		if (!did) return;
		let active = true;
		let busy = false;
		const refresh = async () => {
			if (busy || AppState.currentState !== "active") return;
			busy = true;
			try {
				const next = await radio.auth("authRefresh");
				if (active && (next.state === "signedIn" || next.state === "signedOut"))
					setAuth(next);
			} catch {
				/* A suspended/offline WebView must not clear a saved session. */
			} finally {
				busy = false;
			}
		};
		const timer = setInterval(() => void refresh(), 60000);
		const listener = AppState.addEventListener("change", (state) => {
			if (state === "active") void refresh();
		});
		return () => {
			active = false;
			clearInterval(timer);
			listener.remove();
		};
	}, [did]);
	const account = useQuery({
		queryKey: ["profile", did],
		queryFn: () => profile(did!),
		enabled: !!did,
	});
	useEffect(() => {
		const t = setTimeout(() => setDebounced(query.trim()), 300);
		return () => clearTimeout(t);
	}, [query]);
	useEffect(() => {
		if (!nativeAvailable) return;
		let live = true;
		let busy = false;
		let restoring = false;
		const poll = async () => {
			if (busy || AppState.currentState !== "active") return;
			busy = true;
			try {
				const p = await radio.status();
				if (live) setPlayer(p);
				if (restoring) {
					const a = await radio.auth("authStatus");
					if (live && a.state !== "restoring") {
						setAuth(a);
						restoring = false;
					}
				}
			} catch (e) {
				if (live) setPlayError(String(e));
			} finally {
				busy = false;
			}
		};
		void radio
			.auth("authRestore")
			.then((a) => {
				if (live) {
					setAuth(a);
					restoring = a.state === "restoring";
				}
			})
			.catch(() => {});
		const t = setInterval(() => void poll(), 800);
		const listener = AppState.addEventListener("change", () => void poll());
		void poll();
		return () => {
			live = false;
			clearInterval(t);
			listener.remove();
		};
	}, []);
	const results = useQuery({
		queryKey: ["stations", tab, debounced, genre, did, searchGenre],
		queryFn: ({ signal }) => {
			if (tab === "Library") return appviewStations("favorites", did, signal);
			if (tab === "Search") {
				if (debounced) return searchRadioBrowser(debounced, signal);
				if (searchGenre)
					return browseRadioBrowserByTag({
						tag: genres.find((g) => g.label === searchGenre)!.term,
						offset: 0,
						limit: 60,
						signal,
					});
				return [];
			}
			if (genre !== "All")
				return browseRadioBrowserByTag({
					tag:
						genres.find((g) => g.label === genre)?.term || genre.toLowerCase(),
					offset: 0,
					limit: 60,
					signal,
				});
			return appviewStations("popular", undefined, signal);
		},
		enabled:
			tab !== "Profile" &&
			(tab !== "Library" || !!did) &&
			(tab !== "Search" || debounced.length > 0 || !!searchGenre),
	});
	const openProfileLink = async (destination: "bluesky" | "pdsls") => {
		if (!did) return;
		try {
			let url = `https://pdsls.dev/at://${did}`;
			if (destination === "bluesky") {
				let handle = [account.data?.handle, auth.profile?.handle]
					.map((value) => normalizeHandle(value || ""))
					.find(isValidHandle);
				if (!handle) handle = normalizeHandle((await profile(did)).handle);
				if (!isValidHandle(handle)) {
					throw new Error(
						"Your Bluesky handle is unavailable. Refresh your profile and try again.",
					);
				}
				url = `https://bsky.app/profile/${encodeURIComponent(handle)}`;
			}
			await Linking.openURL(url);
		} catch (error) {
			Alert.alert(
				"Could not open link",
				error instanceof Error ? error.message : "Please try again.",
			);
		}
	};
	const refreshProfile = async () => {
		if (!did || profileRefreshBusy.current) return;
		profileRefreshBusy.current = true;
		setRefreshingProfile(true);
		try {
			await Promise.allSettled([
				client.invalidateQueries({ queryKey: ["profile", did], exact: true }),
				client.invalidateQueries({ queryKey: ["profile-stations", did] }),
			]);
		} finally {
			profileRefreshBusy.current = false;
			setRefreshingProfile(false);
		}
	};
	const openRegister = () => {
		if (did) setRegister(true);
		else {
			registerAfterLogin.current = true;
			setLogin(true);
		}
	};
	const onAuth = useCallback((a: AuthState) => {
		setAuth(a);
		setLogin(false);
		if (registerAfterLogin.current) {
			registerAfterLogin.current = false;
			setRegister(true);
		}
		void client.invalidateQueries({ queryKey: ["stations"] });
	}, []);
	const play = async (station: Station) => {
		playRequest.current?.abort();
		const controller = new AbortController();
		playRequest.current = controller;
		try {
			if (Platform.OS === "android" && Number(Platform.Version) >= 33)
				await PermissionsAndroid.request(
					PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
				);
			setPlayError("");
			await radio.play(station, controller.signal);
			if (controller.signal.aborted) return;
			setPlayer({ state: "buffering", station });
		} catch (e) {
			if (controller.signal.aborted) return;
			setPlayError(String(e));
		}
	};
	const control = async (action: "play" | "pause" | "stop") => {
		try {
			if (action !== "play") playRequest.current?.abort();
			await radio.control(action);
		} catch (e) {
			setPlayError(String(e));
		}
	};
	const playing = player.state === "playing" || player.state === "buffering";
	const row = ({ item }: { item: Station }) => (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Listen to ${item.name}`}
			style={s.station}
			onPress={() => void play(item)}
		>
			<Artwork station={item} />
			<View style={{ flex: 1, gap: 5 }}>
				<Text numberOfLines={1} style={s.stationName}>
					{item.name}
				</Text>
				<Text numberOfLines={1} style={s.muted}>
					{[item.genre || item.tags?.[0], item.country]
						.filter(Boolean)
						.join(" · ") || "Live radio"}
				</Text>
				{!!item.bitrate && (
					<Text style={s.small}>
						{item.codec} · {item.bitrate} kbps
					</Text>
				)}
			</View>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Comments and reactions for ${item.name}`}
				onPress={(event) => {
					event.stopPropagation();
					setDiscussion(item);
				}}
				style={{ padding: 10 }}
			>
				<Feather name="message-circle" size={23} color={c.muted} />
			</Pressable>
			<Feather
				name={
					player.station?.id === item.id && playing ? "volume-2" : "play-circle"
				}
				size={26}
				color={c.cyan}
			/>
		</Pressable>
	);
	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<StatusBar style="light" />
			<AuthRuntime onStateChange={setAuth} />
			<AudioSettingsSync />
			<View style={s.header}>
				<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
					<Image
						source={require("../assets/pwa-512x512.png")}
						style={{ width: 34, height: 34, borderRadius: 10 }}
					/>
					<Text style={s.brand}>
						atradio<Text style={{ color: c.cyan }}>.fm</Text>
					</Text>
				</View>
				<Pressable
					accessibilityLabel="Account"
					onPress={() => (did ? setTab("Profile") : setLogin(true))}
					style={s.account}
				>
					{account.data?.avatar ? (
						<Image
							source={account.data.avatar}
							style={{ width: 36, height: 36, borderRadius: 18 }}
						/>
					) : (
						<Feather name="user" size={20} color={c.text} />
					)}
				</Pressable>
			</View>
			{tab === "Profile" ? (
				<ScrollView
					alwaysBounceVertical
					contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1 }}
					refreshControl={
						did ? (
							<RefreshControl
								tintColor={c.cyan}
								colors={[c.cyan]}
								progressBackgroundColor={c.surface}
								refreshing={refreshingProfile}
								onRefresh={() => void refreshProfile()}
							/>
						) : undefined
					}
				>
					<Text style={s.heading}>Your frequency.</Text>
					{did ? (
						<>
							<View style={s.profile}>
								<Pressable
									accessibilityRole="link"
									accessibilityLabel={`View ${account.data?.displayName || account.data?.handle || auth.profile?.handle || "your profile"} on Bluesky`}
									onPress={() => void openProfileLink("bluesky")}
									style={{ alignItems: "center", gap: 14 }}
								>
									<Image
										source={account.data?.avatar}
										style={{
											width: 86,
											height: 86,
											borderRadius: 43,
											backgroundColor: c.panel,
										}}
									/>
									<Text style={s.heading}>
										{account.data?.displayName || auth.profile?.handle}
									</Text>
									<Text style={s.muted}>
										@{account.data?.handle || auth.profile?.handle}
									</Text>
								</Pressable>
								<Pressable
									accessibilityRole="link"
									accessibilityLabel="View your ATProto repository on PDSls"
									onPress={() => void openProfileLink("pdsls")}
									style={{
										minHeight: 44,
										paddingHorizontal: 12,
										flexDirection: "row",
										alignItems: "center",
										gap: 8,
									}}
								>
									<Text style={{ color: c.cyan }}>View on PDSls</Text>
									<Feather name="external-link" size={16} color={c.cyan} />
								</Pressable>
							</View>
							<Text style={s.body}>
								Connected with ATProto. Your stations and favorites are shared
								with atradio.fm.
							</Text>
							<StationCollection
								actor={did}
								added={added}
								onPlay={(station) => void play(station)}
								onDiscussion={setDiscussion}
								onRegister={openRegister}
							/>
							<Pressable
								style={s.outlineButton}
								onPress={async () => {
									try {
										await radio.control("stop");
										await radio.auth("authLogout");
										setAuth({ state: "signedOut" });
										setAdded([]);
										client.removeQueries({ queryKey: ["audio-settings"] });
										client.removeQueries({ queryKey: ["profile-stations"] });
										client.removeQueries({ queryKey: ["profile"] });
										client.removeQueries({ queryKey: ["stations"] });
									} catch (e) {
										Alert.alert("Could not sign out", String(e));
									}
								}}
							>
								<Text style={{ color: c.text, fontWeight: "700" }}>
									Sign out
								</Text>
							</Pressable>
						</>
					) : (
						<>
							<Text style={s.body}>
								Bring your ATProto identity and your saved stations with you.
							</Text>
							<Pressable
								style={[s.button, s.pill]}
								onPress={() => setLogin(true)}
							>
								<Text style={s.buttonText}>Sign in with ATProto</Text>
							</Pressable>
						</>
					)}
					<Pressable
						style={[s.outlineButton, s.pill]}
						onPress={() => setEqualizer(true)}
					>
						<Text style={{ color: c.cyan, fontWeight: "700" }}>
							Equalizer settings
						</Text>
					</Pressable>
					<Text style={s.small}>
						Radio Browser discovery · Powered by rockbox-playback
					</Text>
				</ScrollView>
			) : tab === "Library" && !did ? (
				<View style={s.empty}>
					<Feather name="heart" size={44} color={c.cyan} />
					<Text style={s.heading}>Your radio collection.</Text>
					<Text style={[s.body, { textAlign: "center" }]}>
						Sign in to listen to the stations you’ve saved on atradio.fm.
					</Text>
					<Pressable style={[s.button, s.pill]} onPress={() => setLogin(true)}>
						<Text style={s.buttonText}>Sign in</Text>
					</Pressable>
				</View>
			) : (
				<FlatList
					data={
						tab === "Search" && !query.trim() && !searchGenre
							? []
							: (results.data ?? [])
					}
					keyExtractor={(x) => x.id}
					renderItem={row}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					contentContainerStyle={{
						paddingHorizontal: 22,
						paddingBottom: 24,
						flexGrow: 1,
					}}
					refreshControl={
						<RefreshControl
							tintColor={c.cyan}
							refreshing={results.isRefetching}
							onRefresh={() => {
								void results.refetch();
								void client.invalidateQueries({
									queryKey: ["global-recently-played"],
								});
							}}
						/>
					}
					ListHeaderComponent={
						<View>
							{tab === "Discover" ? (
								<>
									<View style={s.hero}>
										<Text style={s.eyebrow}>TUNE IN. ZONE OUT.</Text>
										<Text style={s.heroTitle}>Find your{"\n"}frequency.</Text>
										<Text style={[s.body, { maxWidth: 290 }]}>
											Independent voices. Distant cities.{"\n"}A world of radio,
											always on.
										</Text>
										<View style={s.livePill}>
											<View style={s.dot} />
											<Text
												style={{
													color: c.cyan,
													fontWeight: "700",
													fontSize: 12,
												}}
											>
												LIVE AROUND THE WORLD
											</Text>
										</View>
									</View>
									<Pressable
										style={[
											s.outlineButton,
											{
												marginVertical: 16,
												flexDirection: "row",
												justifyContent: "center",
												gap: 10,
											},
										]}
										onPress={() => setDirectory(true)}
									>
										<Feather name="radio" size={20} color={c.cyan} />
										<Text style={{ color: c.cyan, fontWeight: "700" }}>
											Browse registered stations
										</Text>
									</Pressable>
									<RecentlyPlayed onPlay={(station) => void play(station)} />
									<ScrollView
										horizontal
										showsHorizontalScrollIndicator={false}
										contentContainerStyle={{ gap: 8, paddingVertical: 20 }}
									>
										{genres.map((g) => (
											<Pressable
												key={g.label}
												style={[
													s.chip,
													genre === g.label && {
														backgroundColor: c.cyan,
														borderColor: c.cyan,
													},
												]}
												onPress={() => setGenre(g.label)}
											>
												<Text
													style={{
														color: genre === g.label ? c.bg : c.muted,
														fontWeight: "700",
													}}
												>
													{g.label}
												</Text>
											</Pressable>
										))}
									</ScrollView>
									<Text style={s.section}>
										{genre === "All"
											? "Loved on atradio.fm"
											: `${genre} stations`}
									</Text>
								</>
							) : (
								<>
									<Text style={s.heading}>
										{tab === "Search"
											? "Discover something new."
											: "Saved stations"}
									</Text>
									{tab === "Search" ? (
										<View style={s.search}>
											<Feather name="search" size={20} color={c.muted} />
											<TextInput
												ref={searchInput}
												value={query}
												onChangeText={(text) => {
													setSearchGenre(null);
													setQuery(text);
												}}
												placeholder="Search Radio Browser"
												placeholderTextColor={c.muted}
												style={{
													flex: 1,
													color: c.text,
													fontSize: 16,
													paddingVertical: 14,
												}}
												autoCorrect={false}
												accessibilityLabel="Search radio stations"
												returnKeyType="search"
											/>
											{!!query && (
												<Pressable
													onPress={() => {
														searchInput.current?.clear();
														setQuery("");
														setSearchGenre(null);
														setDebounced("");
														void client.cancelQueries({
															queryKey: ["stations", "Search"],
														});
													}}
													accessibilityRole="button"
													hitSlop={10}
													style={{
														width: 44,
														height: 44,
														alignItems: "center",
														justifyContent: "center",
													}}
													accessibilityLabel="Clear search"
												>
													<Feather name="x" size={20} color={c.muted} />
												</Pressable>
											)}
										</View>
									) : (
										<Text style={[s.muted, { marginVertical: 16 }]}>
											From your ATProto account
										</Text>
									)}
								</>
							)}
							{tab === "Search" && searchGenre && !query.trim() && (
								<View style={{ gap: 12, paddingVertical: 16 }}>
									<Pressable
										accessibilityRole="button"
										onPress={() => setSearchGenre(null)}
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 8,
											minHeight: 44,
										}}
									>
										<Feather name="arrow-left" size={20} color={c.cyan} />
										<Text style={{ color: c.cyan }}>All genres</Text>
									</Pressable>
									<Text style={s.section}>{searchGenre} stations</Text>
								</View>
							)}
						</View>
					}
					ListEmptyComponent={
						tab === "Search" && !query.trim() && !searchGenre ? (
							<GenreGrid
								onSelect={(label) => {
									setDebounced("");
									setSearchGenre(label);
									searchInput.current?.blur();
								}}
							/>
						) : (
							<View
								style={results.isLoading ? { paddingVertical: 12 } : s.empty}
							>
								{results.isLoading ? (
									<StationLoader />
								) : (
									<>
										<Text style={s.body}>
											{results.isError
												? "Stations could not be loaded."
												: tab === "Library"
													? "Your saved stations will appear here."
													: "No stations found."}
										</Text>
										{(tab !== "Search" || !!query.trim() || !!searchGenre) && (
											<Pressable onPress={() => void results.refetch()}>
												<Text style={{ color: c.cyan, padding: 14 }}>
													Retry
												</Text>
											</Pressable>
										)}
									</>
								)}
							</View>
						)
					}
				/>
			)}
			{!!did &&
				(!auth.canPublishPlays || !auth.canSyncEqualizer || !!historyError) && (
					<View style={{ padding: 12, backgroundColor: c.panel }}>
						<Text style={{ color: c.muted }}>
							{!auth.canPublishPlays || !auth.canSyncEqualizer
								? "Allow atradio.fm to sync your listening history and equalizer."
								: historyError}
						</Text>
						{(!auth.canPublishPlays || !auth.canSyncEqualizer) && (
							<Pressable
								onPress={() => setLogin(true)}
								style={{ paddingVertical: 12 }}
							>
								<Text style={{ color: c.cyan }}>
									Reconnect to enable account sync
								</Text>
							</Pressable>
						)}
					</View>
				)}
			{!!playError && (
				<Pressable
					onPress={() => setPlayError("")}
					style={{ padding: 12, backgroundColor: c.panel }}
				>
					<Text style={{ color: c.error }}>{playError}</Text>
				</Pressable>
			)}
			{player.station && (
				<View style={s.mini}>
					<Pressable
						style={{
							flex: 1,
							flexDirection: "row",
							gap: 12,
							alignItems: "center",
						}}
						onPress={() => setExpanded(true)}
					>
						<Artwork station={player.station} size={44} />
						<View style={{ flex: 1 }}>
							<Text
								style={{ color: c.text, fontWeight: "700" }}
								numberOfLines={1}
							>
								{player.station.name}
							</Text>
							<Text
								style={{
									color: player.error ? c.error : c.cyan,
									fontSize: 12,
									marginTop: 4,
								}}
								numberOfLines={1}
							>
								{player.error ||
									(player.state === "buffering"
										? "Connecting…"
										: player.title || (playing ? "Live radio" : "Paused"))}
							</Text>
						</View>
					</Pressable>
					<Pressable
						accessibilityLabel={playing ? "Pause radio" : "Play radio"}
						onPress={() => void control(playing ? "pause" : "play")}
						style={{ padding: 14 }}
					>
						{player.state === "buffering" ? (
							<ActivityIndicator color={c.cyan} />
						) : (
							<Feather
								name={playing ? "pause" : "play"}
								size={26}
								color={c.text}
							/>
						)}
					</Pressable>
				</View>
			)}
			<View style={[s.tabs, { paddingBottom: Math.max(insets.bottom, 12) }]}>
				{(Object.keys(icons) as Tab[]).map((t, index) => (
					<React.Fragment key={t}>
						{index === 2 && (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel="Register a station"
								onPress={openRegister}
								style={{
									width: 52,
									height: 52,
									borderRadius: 26,
									alignItems: "center",
									justifyContent: "center",
									alignSelf: "center",
									backgroundColor: c.cyan,
									marginHorizontal: 8,
								}}
							>
								<Feather name="plus" size={28} color={c.bg} />
							</Pressable>
						)}
						<Pressable
							key={t}
							accessibilityRole="tab"
							accessibilityState={{ selected: tab === t }}
							onPress={() => setTab(t)}
							style={s.tab}
						>
							<Feather
								name={icons[t]}
								size={22}
								color={tab === t ? c.cyan : c.muted}
							/>
							<Text
								style={{
									color: tab === t ? c.cyan : c.muted,
									fontSize: 10,
									marginTop: 5,
									fontWeight: "600",
								}}
							>
								{t}
							</Text>
						</Pressable>
					</React.Fragment>
				))}
			</View>
			<Modal
				visible={login}
				animationType="slide"
				onRequestClose={() => {
					registerAfterLogin.current = false;
					setLogin(false);
				}}
			>
				{login && (
					<SignIn
						onClose={() => {
							registerAfterLogin.current = false;
							setLogin(false);
						}}
						onAuth={onAuth}
					/>
				)}
			</Modal>
			<Modal
				visible={equalizer}
				animationType="slide"
				onRequestClose={() => setEqualizer(false)}
			>
				{equalizer && <Equalizer onClose={() => setEqualizer(false)} />}
			</Modal>
			<Modal
				visible={register}
				animationType="slide"
				onRequestClose={() => setRegister(false)}
			>
				{register && (
					<RegisterStation
						onClose={() => setRegister(false)}
						onCreated={(station) => {
							setAdded((old) => [station, ...old]);
							setRegister(false);
							setDirectory(true);
							Alert.alert(
								"Station registered",
								"Your station is saved to your ATProto account. It will appear for other listeners once indexed.",
							);
						}}
					/>
				)}
			</Modal>
			<Modal
				visible={directory}
				animationType="slide"
				onRequestClose={() => setDirectory(false)}
			>
				<View
					style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}
				>
					<View
						style={{
							padding: 18,
							flexDirection: "row",
							alignItems: "center",
							gap: 15,
						}}
					>
						<Pressable
							accessibilityLabel="Close registered stations"
							onPress={() => setDirectory(false)}
						>
							<Feather name="chevron-down" size={26} color={c.text} />
						</Pressable>
						<Text style={s.section}>Registered stations</Text>
					</View>
					<ScrollView
						keyboardShouldPersistTaps="handled"
						contentContainerStyle={{
							paddingHorizontal: 22,
							paddingBottom: insets.bottom + 24,
						}}
					>
						<StationCollection
							directory
							added={added}
							onPlay={(station) => {
								void play(station);
								setDirectory(false);
							}}
							onDiscussion={(station) => {
								setDirectory(false);
								setDiscussion(station);
							}}
							onRegister={() => {
								setDirectory(false);
								openRegister();
							}}
						/>
					</ScrollView>
				</View>
			</Modal>
			<Modal
				visible={!!discussion}
				animationType="slide"
				onRequestClose={() => setDiscussion(null)}
			>
				{discussion && (
					<StationDiscussion
						key={discussion.id}
						station={discussion}
						did={did}
						handle={auth.profile?.handle}
						avatar={account.data?.avatar}
						onClose={() => setDiscussion(null)}
						onSignIn={() => {
							setDiscussion(null);
							setLogin(true);
						}}
					/>
				)}
			</Modal>
			<Modal
				visible={expanded && !!player.station}
				animationType="slide"
				onRequestClose={() => setExpanded(false)}
			>
				<View
					style={[
						s.full,
						{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
					]}
				>
					{expanded && !!player.station?.favicon && (
						<View
							pointerEvents="none"
							accessibilityElementsHidden
							importantForAccessibility="no-hide-descendants"
							style={StyleSheet.absoluteFill}
						>
							<Image
								key={player.station.favicon}
								source={player.station.favicon}
								style={StyleSheet.absoluteFill}
								contentFit="cover"
								blurRadius={40}
								accessible={false}
							/>
							<View
								style={[
									StyleSheet.absoluteFill,
									{ backgroundColor: "rgba(8, 13, 27, 0.78)" },
								]}
							/>
						</View>
					)}
					<View
						style={{
							width: "100%",
							flexDirection: "row",
							alignItems: "center",
							justifyContent: "space-between",
						}}
					>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Close player"
							onPress={() => setExpanded(false)}
							hitSlop={10}
							style={{
								width: 48,
								height: 48,
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Feather name="chevron-down" size={28} color={c.text} />
						</Pressable>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Equalizer settings"
							onPress={() => {
								setExpanded(false);
								setEqualizer(true);
							}}
							hitSlop={10}
							style={{
								width: 48,
								height: 48,
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Feather name="sliders" size={24} color={c.cyan} />
						</Pressable>
					</View>
					{player.station && <Artwork station={player.station} size={270} />}
					<Text style={[s.heading, { textAlign: "center" }]}>
						{player.station?.name}
					</Text>
					<Text style={[s.body, { textAlign: "center" }]}>
						{player.error ||
							player.title ||
							player.station?.genre ||
							"Live radio"}
					</Text>
					<View style={{ flexDirection: "row", alignItems: "center", gap: 32 }}>
						<Pressable
							onPress={() => void control("stop")}
							accessibilityLabel="Stop radio"
						>
							<Feather name="square" size={26} color={c.muted} />
						</Pressable>
						<Pressable
							onPress={() => void control(playing ? "pause" : "play")}
							accessibilityLabel={playing ? "Pause radio" : "Play radio"}
							style={s.bigPlay}
						>
							{player.state === "buffering" ? (
								<ActivityIndicator color={c.bg} />
							) : (
								<Feather
									name={playing ? "pause" : "play"}
									size={38}
									color={c.bg}
								/>
							)}
						</Pressable>
						<Pressable
							onPress={() => player.station && void play(player.station)}
							accessibilityLabel="Reconnect live stream"
						>
							<Feather name="refresh-cw" size={26} color={c.muted} />
						</Pressable>
					</View>
					<Pressable
						onPress={() => {
							setExpanded(false);
							setDiscussion(player.station ?? null);
						}}
						style={{ padding: 14, flexDirection: "row", gap: 10 }}
					>
						<Feather name="message-circle" size={22} color={c.cyan} />
						<Text style={{ color: c.cyan }}>Comments & reactions</Text>
					</Pressable>
					<Text style={s.small}>LIVE STREAM · Resumes at the live edge</Text>
				</View>
			</Modal>
		</View>
	);
}
export default function App() {
	return (
		<JotaiProvider>
			<SafeAreaProvider>
				<QueryClientProvider client={client}>
					<Main />
				</QueryClientProvider>
			</SafeAreaProvider>
		</JotaiProvider>
	);
}
const s = StyleSheet.create({
	header: {
		paddingHorizontal: 22,
		paddingVertical: 16,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	brand: { color: c.text, fontSize: 25, fontWeight: "800", letterSpacing: -1 },
	account: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: c.surface,
		alignItems: "center",
		justifyContent: "center",
	},
	hero: {
		backgroundColor: c.surface,
		borderWidth: 1,
		borderColor: c.border,
		borderRadius: 26,
		padding: 24,
		marginTop: 12,
	},
	eyebrow: { color: c.cyan, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
	heroTitle: {
		color: c.text,
		fontSize: 46,
		lineHeight: 50,
		fontWeight: "800",
		letterSpacing: -1.8,
		marginTop: 15,
	},
	body: { color: c.muted, fontSize: 15, lineHeight: 23 },
	livePill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 24,
	},
	dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.cyan },
	chip: {
		paddingHorizontal: 17,
		paddingVertical: 11,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: c.border,
	},
	section: { fontSize: 20, fontWeight: "800", color: c.text, marginBottom: 12 },
	heading: {
		fontSize: 28,
		fontWeight: "800",
		color: c.text,
		letterSpacing: -0.6,
	},
	station: {
		flexDirection: "row",
		gap: 14,
		alignItems: "center",
		paddingVertical: 14,
		borderBottomWidth: 1,
		borderBottomColor: c.border,
	},
	stationName: { color: c.text, fontSize: 16, fontWeight: "700" },
	muted: { color: c.muted, fontSize: 13 },
	small: { color: c.muted, fontSize: 11 },
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 20,
		padding: 28,
	},
	search: {
		flexDirection: "row",
		gap: 10,
		alignItems: "center",
		backgroundColor: c.surface,
		borderRadius: 15,
		paddingHorizontal: 15,
		marginVertical: 20,
	},
	tabs: {
		flexDirection: "row",
		paddingTop: 12,
		backgroundColor: c.surface,
		borderTopWidth: 1,
		borderTopColor: c.border,
	},
	tab: { flex: 1, alignItems: "center", justifyContent: "center" },
	mini: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: c.panel,
		paddingLeft: 15,
		paddingVertical: 10,
		borderTopWidth: 1,
		borderTopColor: c.border,
	},
	button: {
		backgroundColor: c.cyan,
		borderRadius: 15,
		padding: 17,
		alignItems: "center",
	},
	pill: { borderRadius: 999 },
	buttonText: { color: c.bg, fontWeight: "800", fontSize: 15 },
	outlineButton: {
		borderWidth: 1,
		borderColor: c.border,
		borderRadius: 15,
		padding: 17,
		alignItems: "center",
	},
	profile: { alignItems: "center", gap: 14, padding: 25 },
	full: {
		flex: 1,
		backgroundColor: c.bg,
		paddingHorizontal: 28,
		alignItems: "center",
		justifyContent: "space-between",
	},
	bigPlay: {
		width: 88,
		height: 88,
		borderRadius: 44,
		backgroundColor: c.cyan,
		alignItems: "center",
		justifyContent: "center",
	},
});
