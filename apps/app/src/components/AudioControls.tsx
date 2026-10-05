import React, { useState } from "react";
import { View, Pressable } from "react-native";
import Slider from "@react-native-community/slider";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "./Typography";
import { c } from "../theme";

export function AudioSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<View
			style={{
				gap: 18,
				borderTopWidth: 1,
				borderColor: c.border,
				paddingTop: 22,
				marginTop: 8,
			}}
		>
			<Text
				style={{
					color: c.text,
					fontFamily: "Lexend",
					fontSize: 20,
					fontWeight: "600",
				}}
			>
				{title}
			</Text>
			{children}
		</View>
	);
}
export function AudioRange({
	label,
	value,
	min,
	max,
	step = 1,
	unit = "",
	format,
	disabled = false,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	unit?: string;
	format?: (v: number) => string;
	disabled?: boolean;
	onChange: (v: number) => void;
}) {
	const change = (v: number) =>
		onChange(Math.max(min, Math.min(max, Math.round(v / step) * step)));
	return (
		<View style={{ gap: 6, opacity: disabled ? 0.45 : 1 }}>
			<View
				style={{
					flexDirection: "row",
					justifyContent: "space-between",
					gap: 8,
				}}
			>
				<Text style={{ color: c.text, flex: 1 }}>{label}</Text>
				<Text style={{ color: c.cyan }}>
					{format ? format(value) : `${value}${unit}`}
				</Text>
			</View>
			<View style={{ flexDirection: "row", alignItems: "center" }}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Decrease ${label}`}
					disabled={disabled || value <= min}
					onPress={() => change(value - step)}
					style={{
						minWidth: 48,
						minHeight: 48,
						alignItems: "center",
						justifyContent: "center",
						opacity: value <= min ? 0.35 : 1,
					}}
				>
					<Feather name="minus" size={22} color={c.cyan} />
				</Pressable>
				<Slider
					style={{ flex: 1 }}
					accessibilityLabel={label}
					disabled={disabled}
					value={value}
					minimumValue={min}
					maximumValue={max}
					step={step}
					onValueChange={change}
					minimumTrackTintColor={c.cyan}
					maximumTrackTintColor={c.border}
					thumbTintColor={c.cyan}
				/>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Increase ${label}`}
					disabled={disabled || value >= max}
					onPress={() => change(value + step)}
					style={{
						minWidth: 48,
						minHeight: 48,
						alignItems: "center",
						justifyContent: "center",
						opacity: value >= max ? 0.35 : 1,
					}}
				>
					<Feather name="plus" size={22} color={c.cyan} />
				</Pressable>
			</View>
		</View>
	);
}
export function AudioSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: [string, string][];
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<View style={{ gap: 8 }}>
			<Text style={{ color: c.text }}>{label}</Text>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${label}: ${options.find(([key]) => key === value)?.[1] ?? value}`}
				accessibilityState={{ expanded: open }}
				onPress={() => setOpen(!open)}
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					minHeight: 48,
					borderRadius: 24,
					paddingHorizontal: 18,
					borderWidth: 1,
					borderColor: c.border,
					backgroundColor: c.surface,
				}}
			>
				<Text style={{ color: c.text }}>
					{options.find(([key]) => key === value)?.[1] ?? value}
				</Text>
				<Feather
					name={open ? "chevron-up" : "chevron-down"}
					size={20}
					color={c.cyan}
				/>
			</Pressable>
			{open && (
				<View
					style={{ borderRadius: 18, backgroundColor: c.panel, padding: 6 }}
				>
					{options.map(([key, text]) => (
						<Pressable
							key={key}
							accessibilityRole="radio"
							accessibilityState={{ checked: value === key }}
							onPress={() => {
								onChange(key);
								setOpen(false);
							}}
							style={{
								minHeight: 48,
								paddingHorizontal: 14,
								flexDirection: "row",
								alignItems: "center",
								justifyContent: "space-between",
							}}
						>
							<Text style={{ color: key === value ? c.cyan : c.text }}>
								{text}
							</Text>
							{key === value && (
								<Feather name="check" color={c.cyan} size={20} />
							)}
						</Pressable>
					))}
				</View>
			)}
		</View>
	);
}
