import React, { createContext, forwardRef, useContext } from "react";
import {
	Text as NativeText,
	TextInput as NativeTextInput,
	StyleSheet,
	type TextProps,
	type TextInputProps,
	type TextStyle,
} from "react-native";

const TypographyContext = createContext({ family: "Outfit", weight: "400" });
const weights = {
	"400": "Regular",
	"500": "Medium",
	"600": "SemiBold",
	"700": "Bold",
	"800": "ExtraBold",
} as const;
function resolveFont(
	style: TextStyle | undefined,
	parent: { family: string; weight: string },
) {
	const family = style?.fontFamily || parent.family;
	const requested = style?.fontWeight ?? parent.weight;
	const numeric =
		requested === "bold"
			? 700
			: requested === "normal"
				? 400
				: Number(requested);
	const weight = String(
		Math.max(
			400,
			Math.min(
				family === "JetBrainsMono" ? 700 : 800,
				Math.round(numeric / 100) * 100,
			),
		),
	) as keyof typeof weights;
	return {
		family,
		weight,
		fontFamily: `${family}_${weight}${weights[weight]}`,
	};
}
export const Text = forwardRef<NativeText, TextProps>(function Text(
	{ style, ...props },
	ref,
) {
	const parent = useContext(TypographyContext);
	const font = resolveFont(StyleSheet.flatten(style), parent);
	return (
		<TypographyContext.Provider value={font}>
			<NativeText
				{...props}
				ref={ref}
				style={[style, { fontFamily: font.fontFamily, fontWeight: "normal" }]}
			/>
		</TypographyContext.Provider>
	);
});
export type TextInput = NativeTextInput;
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(
	function TextInput({ style, ...props }, ref) {
		const font = resolveFont(StyleSheet.flatten(style), {
			family: "Outfit",
			weight: "400",
		});
		return (
			<NativeTextInput
				{...props}
				ref={ref}
				style={[style, { fontFamily: font.fontFamily, fontWeight: "normal" }]}
			/>
		);
	},
);
