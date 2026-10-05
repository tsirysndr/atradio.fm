import { Text } from "./Typography";
import React, { useRef } from "react";
import {
	View,
	ScrollView,
	Pressable,
	Switch,
	ActivityIndicator,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { c } from "../theme";
export type { EqSettings } from "../playback/equalizer";
import {
	defaultEqualizer as defaults,
	type EqSettings,
} from "../playback/equalizer";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
	equalizerAtom,
	equalizerRevisionAtom,
	equalizerSyncAtom,
} from "../state/equalizer";
export default function Equalizer({ onClose }: { onClose: () => void }) {
	const inset = useSafeAreaInsets();
	const [settings, setSettings] = useAtom(equalizerAtom);
	const setRevision = useSetAtom(equalizerRevisionAtom);
	const syncStatus = useAtomValue(equalizerSyncAtom);
	const current = useRef(settings ?? defaults());
	current.current = settings ?? defaults();
	const apply = (next: EqSettings) => {
		current.current = next;
		setSettings(next);
		setRevision((n) => n + 1);
	};
	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: inset.top }}>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					padding: 20,
					gap: 18,
				}}
			>
				<Pressable accessibilityLabel="Close equalizer" onPress={onClose}>
					<Feather name="chevron-down" size={26} color={c.text} />
				</Pressable>
				<Text
					style={{
						color: c.text,
						fontFamily: "Lexend",
						fontSize: 24,
						fontWeight: "800",
					}}
				>
					Equalizer
				</Text>
			</View>
			{!settings ? (
				<ActivityIndicator color={c.cyan} />
			) : (
				<ScrollView
					contentContainerStyle={{
						paddingHorizontal: 24,
						paddingBottom: inset.bottom + 24,
						gap: 15,
					}}
				>
					<View style={{ flexDirection: "row", alignItems: "center" }}>
						<Text style={{ flex: 1, color: c.text, fontSize: 18 }}>
							Enable equalizer
						</Text>
						<Switch
							accessibilityLabel="Enable equalizer"
							value={settings.enabled}
							onValueChange={(enabled) =>
								apply({ ...current.current, enabled })
							}
							trackColor={{ false: c.border, true: c.cyan }}
							thumbColor={settings.enabled ? c.bg : c.muted}
						/>
					</View>
					<Text style={{ color: c.muted, lineHeight: 22 }}>
						Shape the sound on this device. Changes apply to the playing station
						and are saved automatically.
					</Text>
					<Text style={{ color: c.muted }}>{syncStatus}</Text>
					{settings.bands.map((band, index) => (
						<View
							key={band.frequency}
							style={{ opacity: settings.enabled ? 1 : 0.45 }}
						>
							<View
								style={{
									flexDirection: "row",
									justifyContent: "space-between",
								}}
							>
								<Text style={{ color: c.text }}>
									{band.frequency >= 1000
										? `${band.frequency / 1000} kHz`
										: `${band.frequency} Hz`}
								</Text>
								<Text style={{ color: c.cyan }}>
									{band.gain > 0 ? "+" : ""}
									{band.gain / 10} dB
								</Text>
							</View>
							<Slider
								accessibilityLabel={`${band.frequency} Hz gain`}
								disabled={!settings.enabled}
								minimumValue={-240}
								maximumValue={240}
								step={10}
								value={band.gain}
								minimumTrackTintColor={c.cyan}
								maximumTrackTintColor={c.border}
								thumbTintColor={c.cyan}
								onValueChange={(gain) => {
									const next = {
										...current.current,
										bands: current.current.bands.map((b, i) =>
											i === index ? { ...b, gain } : b,
										),
									};
									current.current = next;
									setSettings(next);
								}}
								onSlidingComplete={() => apply(current.current)}
							/>
						</View>
					))}
					<Text style={{ color: c.text }}>
						Precut (this device): {settings.precut / 10} dB
					</Text>
					<Slider
						accessibilityLabel="Equalizer precut"
						disabled={!settings.enabled}
						minimumValue={-240}
						maximumValue={0}
						step={10}
						value={settings.precut}
						minimumTrackTintColor={c.cyan}
						maximumTrackTintColor={c.border}
						thumbTintColor={c.cyan}
						onValueChange={(precut) => {
							current.current = { ...current.current, precut };
							setSettings(current.current);
						}}
						onSlidingComplete={() => apply(current.current)}
					/>
					<Text style={{ color: c.muted }}>
						Reduce precut when boosting bands to leave more headroom.
					</Text>
					<Pressable
						onPress={() =>
							apply({ ...defaults(), enabled: current.current.enabled })
						}
						style={{
							borderWidth: 1,
							borderColor: c.border,
							padding: 16,
							borderRadius: 12,
							alignItems: "center",
						}}
					>
						<Text style={{ color: c.cyan, fontWeight: "700" }}>
							Reset to flat
						</Text>
					</Pressable>
				</ScrollView>
			)}
		</View>
	);
}
