import React, { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import ContentLoader, { Circle, Rect } from "react-content-loader/native";
import { c } from "../theme";

export default function StationLoader({
	count = 5,
	cards = false,
}: {
	count?: number;
	cards?: boolean;
}) {
	const [width, setWidth] = useState(0);
	const [reduceMotion, setReduceMotion] = useState(true);
	useEffect(() => {
		let live = true;
		void AccessibilityInfo.isReduceMotionEnabled()
			.then((value) => {
				if (live) setReduceMotion(value);
			})
			.catch(() => {});
		const listener = AccessibilityInfo.addEventListener(
			"reduceMotionChanged",
			setReduceMotion,
		);
		return () => {
			live = false;
			listener.remove();
		};
	}, []);
	return (
		<View
			accessible
			accessibilityLabel="Loading stations"
			accessibilityState={{ busy: true }}
			pointerEvents="none"
			style={{
				width: "100%",
				overflow: "hidden",
				...(cards ? { minWidth: 240 } : {}),
			}}
			onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
		>
			{width > 0 && (
				<ContentLoader
					width={width}
					height={cards ? 152 : count * 80}
					viewBox={`0 0 ${width} ${cards ? 152 : count * 80}`}
					animate={!reduceMotion}
					speed={1.6}
					backgroundColor={c.surface}
					foregroundColor={c.border}
				>
					{Array.from({ length: count }, (_, index) =>
						cards ? (
							<React.Fragment key={index}>
								<Rect
									x={index * 252 + 16}
									y={16}
									width={48}
									height={48}
									rx={10}
								/>
								<Rect
									x={index * 252 + 76}
									y={20}
									width={130}
									height={14}
									rx={4}
								/>
								<Rect
									x={index * 252 + 76}
									y={44}
									width={94}
									height={10}
									rx={4}
								/>
								<Circle cx={index * 252 + 27} cy={87} r={11} />
								<Rect
									x={index * 252 + 46}
									y={82}
									width={150}
									height={10}
									rx={4}
								/>
								<Rect
									x={index * 252 + 16}
									y={116}
									width={78}
									height={10}
									rx={4}
								/>
							</React.Fragment>
						) : (
							<React.Fragment key={index}>
								<Rect
									x={0}
									y={index * 80 + 10}
									width={54}
									height={54}
									rx={11}
								/>
								<Rect
									x={68}
									y={index * 80 + 18}
									width={Math.max(24, (width - 112) * 0.85)}
									height={14}
									rx={4}
								/>
								<Rect
									x={68}
									y={index * 80 + 43}
									width={Math.max(20, (width - 112) * 0.6)}
									height={10}
									rx={4}
								/>
								<Circle cx={width - 14} cy={index * 80 + 37} r={12} />
							</React.Fragment>
						),
					)}
				</ContentLoader>
			)}
		</View>
	);
}
