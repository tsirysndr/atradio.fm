import { Text } from "./Typography";
import React from "react";
import { View, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { genres } from "../genres";
import { c } from "../theme";
const palette = [
	"#243D50",
	"#413050",
	"#3F342A",
	"#253F39",
	"#34335B",
	"#492F3E",
];
export default function GenreGrid({
	onSelect,
}: {
	onSelect: (label: string) => void;
}) {
	return (
		<View style={{ paddingTop: 12, gap: 18 }}>
			<Text
				style={{
					color: c.text,
					fontFamily: "Lexend",
					fontSize: 20,
					fontWeight: "700",
				}}
			>
				Browse genres
			</Text>
			<View
				style={{
					flexDirection: "row",
					flexWrap: "wrap",
					justifyContent: "space-between",
					rowGap: 12,
				}}
			>
				{genres
					.filter((g) => g.term)
					.map((genre, i) => (
						<Pressable
							key={genre.term}
							accessibilityRole="button"
							accessibilityLabel={`Browse ${genre.label} stations`}
							onPress={() => onSelect(genre.label)}
							style={({ pressed }) => ({
								width: "48%",
								minHeight: 110,
								borderRadius: 16,
								padding: 16,
								justifyContent: "space-between",
								backgroundColor: palette[i % palette.length],
								opacity: pressed ? 0.7 : 1,
							})}
						>
							<Feather
								name={
									i % 3 === 0 ? "radio" : i % 3 === 1 ? "headphones" : "music"
								}
								size={24}
								color={c.cyan}
							/>
							<View
								style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
							>
								<Text
									style={{
										flex: 1,
										color: c.text,
										fontSize: 16,
										fontWeight: "700",
									}}
								>
									{genre.label}
								</Text>
								<Feather name="arrow-up-right" size={18} color={c.muted} />
							</View>
						</Pressable>
					))}
			</View>
		</View>
	);
}
