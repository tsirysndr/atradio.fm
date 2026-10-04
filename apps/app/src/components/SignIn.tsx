import React, { useEffect, useRef, useState } from "react";
import {
	View,
	Text,
	TextInput,
	Pressable,
	ScrollView,
	KeyboardAvoidingView,
	Platform,
	Keyboard,
	ActivityIndicator,
	StyleSheet,
} from "react-native";
import { WebView } from "react-native-webview";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	isValidHandle,
	normalizeHandle,
	resolveSignInHandle,
	searchHandleSuggestions,
} from "../api/handleLookup";
import { radio, type AuthState } from "../native";
import { c } from "../theme";
export default function SignIn({
	onClose,
	onAuth,
}: {
	onClose: () => void;
	onAuth: (a: AuthState) => void;
}) {
	const insets = useSafeAreaInsets();
	const [handle, setHandle] = useState("");
	const [debounced, setDebounced] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [authUrl, setAuthUrl] = useState("");
	const callbackSeen = useRef("");
	const opened = useRef("");
	const active = useRef(true);
	const normalized = normalizeHandle(handle);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(normalized), 300);
		return () => clearTimeout(t);
	}, [normalized]);
	useEffect(
		() => () => {
			if (active.current) void radio.auth("authCancel").catch(() => {});
		},
		[],
	);
	const resolved = useQuery({
		queryKey: ["handle", debounced],
		queryFn: ({ signal }) => resolveSignInHandle(debounced, signal),
		enabled: isValidHandle(debounced),
		retry: false,
		staleTime: 0,
	});
	const suggestions = useQuery({
		queryKey: ["suggest", debounced],
		queryFn: ({ signal }) => searchHandleSuggestions(debounced, signal),
		enabled: debounced.length >= 2 && !busy,
		retry: false,
	});
	const valid =
		normalized === debounced &&
		isValidHandle(normalized) &&
		!resolved.isFetching &&
		!resolved.isError &&
		resolved.data?.handle === normalized &&
		!!resolved.data.did;
	useEffect(() => {
		if (!busy) return;
		let live = true;
		let polling = false;
		const poll = async () => {
			if (polling) return;
			polling = true;
			try {
				const a = await radio.auth("authStatus");
				if (!live) return;
				if (a.url && a.url !== opened.current) {
					opened.current = a.url;
					Keyboard.dismiss();
					setAuthUrl(a.url);
				}
				if (a.state === "signedIn") {
					active.current = false;
					setBusy(false);
					onAuth(a);
				}
				if (a.state === "error") {
					setAuthUrl("");
					setError(a.error ?? "Sign-in failed.");
					setBusy(false);
				}
			} catch (e) {
				if (live) {
					setError(String(e));
					setBusy(false);
				}
			} finally {
				polling = false;
			}
		};
		const t = setInterval(() => void poll(), 700);
		void poll();
		return () => {
			live = false;
			clearInterval(t);
		};
	}, [busy, onAuth]);
	const cancel = async () => {
		await radio.auth("authCancel").catch(() => {});
		onClose();
	};
	if (authUrl)
		return (
			<View
				style={{
					flex: 1,
					backgroundColor: c.bg,
					paddingTop: insets.top,
					paddingBottom: insets.bottom,
				}}
			>
				<View
					style={{
						padding: 16,
						flexDirection: "row",
						alignItems: "center",
						gap: 18,
					}}
				>
					<Pressable accessibilityRole="button" onPress={() => void cancel()}>
						<Text style={{ color: c.cyan, fontSize: 16 }}>Cancel</Text>
					</Pressable>
					<Text style={{ color: c.text, fontWeight: "700", flex: 1 }}>
						atradio.fm Login
					</Text>
				</View>
				<WebView
					source={{ uri: authUrl }}
					style={{ flex: 1 }}
					javaScriptEnabled
					domStorageEnabled
					startInLoadingState
					originWhitelist={["*"]}
					setSupportMultipleWindows={false}
					onShouldStartLoadWithRequest={({ url }) => {
						try {
							const target = new URL(url);
							if (
								target.origin === "https://atradio.fm" &&
								target.pathname === "/oauth/callback"
							) {
								if (callbackSeen.current !== url) {
									callbackSeen.current = url;
									setAuthUrl("");
									void radio.auth("authCallback", url).catch((e) => {
										setError(String(e));
										setBusy(false);
									});
								}
								return false;
							}
							return target.protocol === "https:";
						} catch {
							return false;
						}
					}}
					onError={() => {
						setAuthUrl("");
						setBusy(false);
						setError("Could not load sign-in. Please try again.");
						void radio.auth("authCancel");
					}}
				/>
			</View>
		);
	return (
		<View style={{ flex: 1, backgroundColor: c.bg }}>
			<KeyboardAvoidingView
				style={{ flex: 1 }}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				<ScrollView
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{
						flexGrow: 1,
						justifyContent: "center",
						padding: 28,
						paddingTop: insets.top + 32,
						paddingBottom: insets.bottom + 28,
					}}
				>
					<Pressable
						accessibilityLabel="Close sign in"
						onPress={() => void cancel()}
						style={{ alignSelf: "flex-end", padding: 12 }}
					>
						<Text style={{ color: c.muted, fontSize: 28 }}>×</Text>
					</Pressable>
					<Text style={s.brand}>atradio.fm</Text>
					<Text style={s.title}>Your radio. Your people.</Text>
					<Text style={s.help}>
						Sign in with your ATProto handle. Your account and saved stations
						stay yours.
					</Text>
					<Text style={s.label}>YOUR HANDLE</Text>
					<TextInput
						editable={!busy}
						autoCapitalize="none"
						autoCorrect={false}
						keyboardType="email-address"
						autoComplete="off"
						placeholder="you.bsky.social"
						placeholderTextColor={c.muted}
						value={handle}
						onChangeText={(v) => {
							setHandle(v);
							setError("");
						}}
						style={s.input}
						accessibilityLabel="ATProto handle"
						returnKeyType="go"
					/>
					{!!normalized && !busy && (
						<Text style={{ color: valid ? c.cyan : c.muted, marginBottom: 12 }}>
							{normalized !== debounced || resolved.isFetching
								? "Checking handle…"
								: resolved.isError
									? "Could not check this handle. Tap Retry."
									: valid
										? "Account found"
										: isValidHandle(normalized)
											? "No ATProto account found."
											: "Enter your full handle, including the domain."}
						</Text>
					)}
					{resolved.isError && (
						<Pressable onPress={() => void resolved.refetch()}>
							<Text style={{ color: c.cyan, padding: 10 }}>Retry lookup</Text>
						</Pressable>
					)}
					{!busy &&
						(suggestions.data ?? []).map((p) => (
							<Pressable
								key={p.did}
								onPress={() => setHandle(p.handle)}
								style={s.person}
							>
								{p.avatar ? (
									<Image
										source={p.avatar}
										style={{ width: 38, height: 38, borderRadius: 19 }}
									/>
								) : (
									<View
										style={{
											width: 38,
											height: 38,
											borderRadius: 19,
											backgroundColor: c.panel,
										}}
									/>
								)}
								<View style={{ flex: 1 }}>
									<Text style={{ color: c.text }}>
										{p.displayName || p.handle}
									</Text>
									<Text style={{ color: c.muted }}>@{p.handle}</Text>
								</View>
							</Pressable>
						))}
					{!!error && (
						<Text
							accessibilityRole="alert"
							style={{ color: c.error, marginVertical: 16 }}
						>
							{error}
						</Text>
					)}
					<Pressable
						disabled={!valid || busy}
						accessibilityRole="button"
						style={[s.button, (!valid || busy) && { opacity: 0.4 }]}
						onPress={async () => {
							try {
								opened.current = "";
								setAuthUrl("");
								callbackSeen.current = "";
								setBusy(true);
								setError("");
								await radio.auth("authStart", normalized);
								setBusy(true);
							} catch (e) {
								setBusy(false);
								setError(String(e));
							}
						}}
					>
						{busy ? (
							<ActivityIndicator color={c.bg} />
						) : (
							<Text style={{ color: c.bg, fontWeight: "800" }}>
								Continue with ATProto
							</Text>
						)}
					</Pressable>
					{busy && <Text style={s.help}>Preparing secure sign-in…</Text>}
					<Text style={s.help}>
						You can listen to radio without an account.
					</Text>
				</ScrollView>
			</KeyboardAvoidingView>
		</View>
	);
}
const s = StyleSheet.create({
	brand: { color: c.cyan, fontSize: 28, fontWeight: "800", marginBottom: 25 },
	title: { color: c.text, fontSize: 32, fontWeight: "800" },
	help: { color: c.muted, fontSize: 15, lineHeight: 23, marginVertical: 18 },
	label: {
		color: c.muted,
		fontSize: 11,
		fontWeight: "800",
		letterSpacing: 2,
		marginTop: 22,
	},
	input: {
		backgroundColor: c.surface,
		borderWidth: 1,
		borderColor: c.border,
		borderRadius: 16,
		color: c.text,
		padding: 17,
		fontSize: 18,
		marginVertical: 12,
	},
	person: {
		flexDirection: "row",
		gap: 12,
		alignItems: "center",
		paddingVertical: 9,
	},
	button: {
		backgroundColor: c.cyan,
		padding: 18,
		borderRadius: 16,
		alignItems: "center",
		marginTop: 20,
	},
});
