import React, { useEffect, useRef, useState } from "react";
import {
	AccessibilityInfo,
	Animated,
	AppState,
	Easing,
	ScrollView,
	View,
	type StyleProp,
	type TextStyle,
} from "react-native";
import { Text } from "./Typography";

/** Measure a single natural-width line and pan only when it exceeds its viewport. */
export default function MarqueeText({
	children,
	style,
	active = true,
}: {
	children: string;
	style?: StyleProp<TextStyle>;
	active?: boolean;
}) {
	const text = children.replace(/\s+/g, " ").trim();
	const [viewport, setViewport] = useState(0);
	const [content, setContent] = useState(0);
	const [reduceMotion, setReduceMotion] = useState(true);
	const [foreground, setForeground] = useState(
		AppState.currentState === "active",
	);
	const offset = useRef(new Animated.Value(0)).current;
	useEffect(() => {
		let live = true;
		void AccessibilityInfo.isReduceMotionEnabled()
			.then((value) => {
				if (live) setReduceMotion(value);
			})
			.catch(() => {});
		const motion = AccessibilityInfo.addEventListener(
			"reduceMotionChanged",
			setReduceMotion,
		);
		const app = AppState.addEventListener("change", (state) =>
			setForeground(state === "active"),
		);
		return () => {
			live = false;
			motion.remove();
			app.remove();
		};
	}, []);
	useEffect(() => {
		offset.setValue(0);
		const distance = Math.max(0, content - viewport);
		if (
			!active ||
			!foreground ||
			reduceMotion ||
			viewport === 0 ||
			distance <= 1
		)
			return;
		const duration = Math.max(1200, (distance / 28) * 1000);
		const animation = Animated.loop(
			Animated.sequence([
				Animated.delay(1500),
				Animated.timing(offset, {
					toValue: -distance,
					duration,
					easing: Easing.linear,
					useNativeDriver: true,
					isInteraction: false,
				}),
				Animated.delay(1500),
				Animated.timing(offset, {
					toValue: 0,
					duration,
					easing: Easing.linear,
					useNativeDriver: true,
					isInteraction: false,
				}),
			]),
		);
		animation.start();
		return () => {
			animation.stop();
			offset.setValue(0);
		};
	}, [text, viewport, content, active, foreground, reduceMotion, offset]);
	return (
		<View
			accessible
			accessibilityLabel={text}
			pointerEvents="none"
			style={{ width: "100%", overflow: "hidden" }}
			onLayout={(event) => setViewport(event.nativeEvent.layout.width)}
		>
			<ScrollView
				horizontal
				scrollEnabled={false}
				showsHorizontalScrollIndicator={false}
				accessible={false}
				importantForAccessibility="no-hide-descendants"
				accessibilityElementsHidden
			>
				<Animated.View
					onLayout={(event) => setContent(event.nativeEvent.layout.width)}
					style={{ minWidth: viewport, transform: [{ translateX: offset }] }}
				>
					<Text accessible={false} numberOfLines={1} style={style}>
						{text}
					</Text>
				</Animated.View>
			</ScrollView>
		</View>
	);
}
