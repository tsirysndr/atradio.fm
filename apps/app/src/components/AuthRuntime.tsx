import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { authHtml } from "../auth/generated/runtime";
import {
	attachAuthRuntime,
	detachAuthRuntime,
	receiveAuthMessage,
} from "../auth/client";
const source = { html: authHtml, baseUrl: "https://atradio.fm/native-oauth/" };
export default function AuthRuntime() {
	const ref = useRef<WebView>(null);
	useEffect(() => detachAuthRuntime, []);
	return (
		<View
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
			style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
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
						if (JSON.parse(nativeEvent.data).ready) {
							attachAuthRuntime((script) =>
								ref.current?.injectJavaScript(script),
							);
							return;
						}
					} catch {
						return;
					}
					receiveAuthMessage(nativeEvent.data);
				}}
				onError={detachAuthRuntime}
				onRenderProcessGone={detachAuthRuntime}
			/>
		</View>
	);
}
