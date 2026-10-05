import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { authHtml } from "../auth/generated/runtime";
import {
	attachAuthRuntime,
	prepareAuthRuntime,
	detachAuthRuntime,
	receiveAuthMessage,
} from "../auth/client";
import type { AuthState } from "../native";
const source = { html: authHtml, baseUrl: "https://atradio.fm/native-oauth/" };
export default function AuthRuntime({
	onStateChange,
}: {
	onStateChange: (state: AuthState) => void;
}) {
	const ref = useRef<WebView>(null);
	const owner = useRef(Symbol("oauth-runtime")).current;
	const ready = useRef(false);
	const loaded = useRef(false);
	useEffect(() => {
		prepareAuthRuntime(owner);
		return () => detachAuthRuntime(owner);
	}, [owner]);
	return (
		<View
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={{ position: "absolute", width: 2, height: 2, opacity: 0.01 }}
		>
			<WebView
				ref={ref}
				source={source}
				javaScriptEnabled
				domStorageEnabled
				originWhitelist={["*"]}
				onShouldStartLoadWithRequest={({ url }) =>
					url === source.baseUrl || url === "about:blank"
				}
				onMessage={({ nativeEvent }) => {
					try {
						const message = JSON.parse(nativeEvent.data);
						if (message.authState) {
							onStateChange(message.authState);
							return;
						}
						if (message.fatal) {
							console.warn("OAuth runtime startup:", message.fatal);
							detachAuthRuntime(
								owner,
								"Could not initialize sign-in: " + message.fatal,
							);
							return;
						}
						if (message.ready) {
							if (ready.current || !loaded.current) return;
							ready.current = true;
							attachAuthRuntime(owner, (script) =>
								ref.current?.injectJavaScript(script),
							);
							return;
						}
					} catch {
						return;
					}
					receiveAuthMessage(nativeEvent.data);
				}}
				onLoadEnd={() => {
					loaded.current = true;
					ref.current?.injectJavaScript(
						"if(window.atradioAuth){window.ReactNativeWebView.postMessage(JSON.stringify({ready:true}));}true;",
					);
				}}
				onError={() => {
					ready.current = false;
					detachAuthRuntime(
						owner,
						"Could not load sign-in. Please reopen the screen.",
					);
				}}
				onRenderProcessGone={() => {
					ready.current = false;
					detachAuthRuntime(
						owner,
						"Sign-in was interrupted. Please restart the app.",
					);
				}}
			/>
		</View>
	);
}
