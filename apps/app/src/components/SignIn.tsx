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
import Svg, { Path } from "react-native-svg";
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
				if (!live || !active.current) return;
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
	const startAuth = async (signup = false) => {
		if (busy || (!signup && !valid)) return;
		opened.current = "";
		callbackSeen.current = "";
		setAuthUrl("");
		setBusy(true);
		setError("");
		Keyboard.dismiss();
		try {
			await radio.auth(
				signup ? "authSignup" : "authStart",
				signup ? "" : normalized,
			);
		} catch (e) {
			if (active.current) {
				setBusy(false);
				setError(String(e));
			}
		}
	};
	const cancel = () => {
		active.current = false;
		Keyboard.dismiss();
		onClose();
		void radio.auth("authCancel").catch(() => {});
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
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Cancel sign in"
						onPress={cancel}
						hitSlop={12}
						style={{ minWidth: 64, minHeight: 48, justifyContent: "center" }}
					>
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
						void radio.auth("authCancel").catch(() => {});
					}}
				/>
			</View>
		);
	return (
		<View style={{ flex: 1, backgroundColor: c.bg }}>
			<View
				style={{
					paddingTop: insets.top + 8,
					paddingHorizontal: 16,
					alignItems: "flex-end",
				}}
			>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Close sign in"
					onPress={cancel}
					hitSlop={12}
					style={{
						width: 48,
						height: 48,
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 24,
						backgroundColor: c.surface,
					}}
				>
					<Text style={{ color: c.text, fontSize: 30 }}>×</Text>
				</Pressable>
			</View>
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
						paddingTop: 20,
						paddingBottom: insets.bottom + 28,
					}}
				>
					<Text style={s.brand}>atradio.fm</Text>
					<Text style={s.title}>Your radio. Your people.</Text>
					<Text style={s.help}>
						Sign in with your ATProto handle. Your account and saved stations
						stay yours.
					</Text>
					<Text style={s.label}>YOUR HANDLE</Text>
					<View style={s.inputRow}>
						<Text style={s.prefix} accessible={false}>
							@
						</Text>
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
								setHandle(v.replace(/^\s*@+/, ""));
								setError("");
							}}
							style={s.input}
							accessibilityLabel="ATProto handle"
							returnKeyType="go"
							onSubmitEditing={() => void startAuth()}
						/>
					</View>
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
						onPress={() => void startAuth()}
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
						atradio.fm is part of the Atmosphere. Create an Atmosphere account
						on Bluesky or any other AT Protocol service to get started.
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Sign up with Bluesky"
						disabled={busy}
						onPress={() => void startAuth(true)}
						style={({ pressed }) => [
							s.signupButton,
							pressed && { backgroundColor: "rgba(0, 210, 255, 0.25)" },
							busy && { opacity: 0.5 },
						]}
					>
						{/* Bluesky icon from Tabler Icons (MIT). */}
						<Svg
							width={16}
							height={16}
							viewBox="0 0 24 24"
							fill="none"
							stroke="#00d2ff"
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
							accessible={false}
						>
							<Path d="M6.335 5.144c-1.654 -1.199 -4.335 -2.127 -4.335 .826c0 .59 .35 4.953 .556 5.661c.713 2.463 3.13 2.75 5.444 2.369c-4.045 .665 -4.889 3.208 -2.667 5.41c1.03 1.018 1.913 1.59 2.667 1.59c2 0 3.134 -2.769 3.5 -3.5c.333 -.667 .5 -1.167 .5 -1.5c0 .333 .167 .833 .5 1.5c.366 .731 1.5 3.5 3.5 3.5c.754 0 1.637 -.571 2.667 -1.59c2.222 -2.203 1.378 -4.746 -2.667 -5.41c2.314 .38 4.73 .094 5.444 -2.369c.206 -.708 .556 -5.072 .556 -5.661c0 -2.953 -2.68 -2.025 -4.335 -.826c-2.293 1.662 -4.76 5.048 -5.665 6.856c-.905 -1.808 -3.372 -5.194 -5.665 -6.856" />
						</Svg>
						<Text style={s.signupText}>Sign up with Bluesky</Text>
					</Pressable>
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
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: c.surface,
		borderWidth: 1,
		borderColor: c.border,
		borderRadius: 999,
		marginVertical: 12,
		paddingLeft: 17,
	},
	prefix: { color: c.muted, fontSize: 20, marginRight: 8 },
	input: {
		flex: 1,
		minWidth: 0,
		color: c.text,
		paddingVertical: 17,
		paddingRight: 17,
		fontSize: 18,
	},
	signupButton: {
		flexDirection: "row",
		gap: 6,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 210, 255, 0.15)",
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 8,
		minHeight: 48,
	},
	signupText: { color: "#00d2ff", fontSize: 14, fontWeight: "500" },
	person: {
		flexDirection: "row",
		gap: 12,
		alignItems: "center",
		paddingVertical: 9,
	},
	button: {
		backgroundColor: c.cyan,
		padding: 18,
		borderRadius: 999,
		alignItems: "center",
		marginTop: 20,
	},
});
