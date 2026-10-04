import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
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
import SignIn from "./components/SignIn";
import { c } from "./theme";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});
const genres = [
  "All",
  "Jazz",
  "Ambient",
  "Electronic",
  "Rock",
  "Classical",
  "Hip hop",
  "Soul",
];
type Tab = "Discover" | "Search" | "Library" | "Profile";
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
  const [tab, setTab] = useState<Tab>("Discover");
  const [auth, setAuth] = useState<AuthState>({ state: "signedOut" });
  const [login, setLogin] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [genre, setGenre] = useState("All");
  const [player, setPlayer] = useState<Playback>({ state: "stopped" });
  const [expanded, setExpanded] = useState(false);
  const [playError, setPlayError] = useState("");
  const did = auth.state === "signedIn" ? auth.profile?.did : undefined;
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
    let restoring = true;
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
        if (live) setAuth(a);
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
    queryKey: ["stations", tab, debounced, genre, did],
    queryFn: ({ signal }) => {
      if (tab === "Library") return appviewStations("favorites", did, signal);
      if (tab === "Search") return searchRadioBrowser(debounced, signal);
      if (genre !== "All")
        return browseRadioBrowserByTag({
          tag: genre.toLowerCase(),
          offset: 0,
          limit: 60,
          signal,
        });
      return appviewStations("popular", undefined, signal);
    },
    enabled: tab !== "Profile" && (tab !== "Library" || !!did),
  });
  const onAuth = useCallback((a: AuthState) => {
    setAuth(a);
    setLogin(false);
    void client.invalidateQueries({ queryKey: ["stations"] });
  }, []);
  const play = async (station: Station) => {
    try {
      if (Platform.OS === "android" && Number(Platform.Version) >= 33)
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      setPlayError("");
      await radio.play(station);
      setPlayer({ state: "buffering", station });
    } catch (e) {
      setPlayError(String(e));
    }
  };
  const control = async (action: "play" | "pause" | "stop") => {
    try {
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
        <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
          <Text style={s.heading}>Your frequency.</Text>
          {did ? (
            <>
              <View style={s.profile}>
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
              </View>
              <Text style={s.body}>
                Connected with ATProto. Your stations and favorites are shared
                with atradio.fm.
              </Text>
              <Pressable style={s.button} onPress={() => setTab("Library")}>
                <Text style={s.buttonText}>My saved stations</Text>
              </Pressable>
              <Pressable
                style={s.outlineButton}
                onPress={async () => {
                  try {
                    await radio.control("stop");
                    await radio.auth("authLogout");
                    setAuth({ state: "signedOut" });
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
              <Pressable style={s.button} onPress={() => setLogin(true)}>
                <Text style={s.buttonText}>Sign in with ATProto</Text>
              </Pressable>
            </>
          )}
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
          <Pressable style={s.button} onPress={() => setLogin(true)}>
            <Text style={s.buttonText}>Sign in</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results.data ?? []}
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
              onRefresh={() => void results.refetch()}
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
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 20 }}
                  >
                    {genres.map((g) => (
                      <Pressable
                        key={g}
                        style={[
                          s.chip,
                          genre === g && {
                            backgroundColor: c.cyan,
                            borderColor: c.cyan,
                          },
                        ]}
                        onPress={() => setGenre(g)}
                      >
                        <Text
                          style={{
                            color: genre === g ? c.bg : c.muted,
                            fontWeight: "700",
                          }}
                        >
                          {g}
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
                        value={query}
                        onChangeText={setQuery}
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
                          onPress={() => setQuery("")}
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
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              {results.isLoading ? (
                <ActivityIndicator color={c.cyan} />
              ) : (
                <>
                  <Text style={s.body}>
                    {results.isError
                      ? "Stations could not be loaded."
                      : tab === "Library"
                        ? "Your saved stations will appear here."
                        : "No stations found."}
                  </Text>
                  <Pressable onPress={() => void results.refetch()}>
                    <Text style={{ color: c.cyan, padding: 14 }}>Retry</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
        />
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
        {(Object.keys(icons) as Tab[]).map((t) => (
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
        ))}
      </View>
      <Modal
        visible={login}
        animationType="slide"
        onRequestClose={() => setLogin(false)}
      >
        {login && <SignIn onClose={() => setLogin(false)} onAuth={onAuth} />}
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
          <Pressable
            accessibilityLabel="Close player"
            onPress={() => setExpanded(false)}
            style={{ padding: 12, alignSelf: "flex-start" }}
          >
            <Feather name="chevron-down" size={28} color={c.text} />
          </Pressable>
          <Text style={s.eyebrow}>ON YOUR FREQUENCY</Text>
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
          <Text style={s.small}>LIVE STREAM · Resumes at the live edge</Text>
        </View>
      </Modal>
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <Main />
      </QueryClientProvider>
    </SafeAreaProvider>
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
