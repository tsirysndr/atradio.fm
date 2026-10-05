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
import { AudioRange, AudioSelect, AudioSection } from "./AudioControls";
import Feather from "@expo/vector-icons/Feather";
import { c } from "../theme";
export type { EqSettings } from "../playback/equalizer";
import {
	defaultEqualizer as defaults,
	type EqSettings,
	defaultDsp,
	type DspSettings,
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
	const dsp = { ...defaultDsp, ...settings?.dsp };
	const updateDsp = <K extends keyof DspSettings>(
		key: K,
		value: DspSettings[K],
	) =>
		apply({
			...current.current,
			dsp: { ...current.current.dsp, [key]: value },
		});
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
				<Pressable accessibilityLabel="Close audio settings" onPress={onClose}>
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
					Audio settings
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
					<Text style={{ color: c.text, fontFamily: "Lexend", fontSize: 20 }}>
						10-band equalizer
					</Text>
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
							apply({
								...current.current,
								...defaults(),
								enabled: current.current.enabled,
							})
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

					<AudioSection title="Tone">
						<AudioRange
							label="Bass"
							value={dsp.bass}
							min={-24}
							max={24}
							unit=" dB"
							onChange={(v) => updateDsp("bass", v)}
						/>
						<AudioRange
							label="Treble"
							value={dsp.treble}
							min={-24}
							max={24}
							unit=" dB"
							onChange={(v) => updateDsp("treble", v)}
						/>
						<AudioRange
							label="Balance (this device)"
							value={settings.balance ?? 0}
							min={-100}
							max={100}
							format={(v) =>
								v === 0
									? "Center"
									: `${Math.abs(v)}% ${v < 0 ? "left" : "right"}`
							}
							onChange={(balance) => apply({ ...current.current, balance })}
						/>
					</AudioSection>
					<AudioSection title="Headphone crossfeed">
						<AudioSelect
							label="Crossfeed mode"
							value={dsp.crossfeedMode}
							options={[
								["off", "Off"],
								["meier", "Meier"],
								["custom", "Custom"],
							]}
							onChange={(v) =>
								updateDsp("crossfeedMode", v as DspSettings["crossfeedMode"])
							}
						/>
						<AudioRange
							label="Direct gain"
							value={dsp.crossfeedDirect}
							min={-6}
							max={0}
							step={0.5}
							unit=" dB"
							disabled={dsp.crossfeedMode !== "custom"}
							onChange={(v) => updateDsp("crossfeedDirect", v)}
						/>
					</AudioSection>
					<AudioSection title="Perceptual bass enhancement (PBE)">
						<AudioRange
							label="PBE strength"
							value={dsp.pbe}
							min={0}
							max={100}
							unit="%"
							onChange={(v) => updateDsp("pbe", v)}
						/>
						<AudioRange
							label="PBE precut"
							value={dsp.pbePrecut}
							min={0}
							max={24}
							format={(v) => `−${v} dB`}
							onChange={(v) => updateDsp("pbePrecut", v)}
						/>
					</AudioSection>
					<AudioSection title="Surround">
						<AudioRange
							label="Surround delay"
							value={dsp.surroundDelay}
							min={0}
							max={30}
							unit=" ms"
							onChange={(v) => updateDsp("surroundDelay", v)}
						/>
						<AudioRange
							label="Surround balance"
							value={dsp.surroundBalance}
							min={0}
							max={100}
							unit="%"
							onChange={(v) => updateDsp("surroundBalance", v)}
						/>
					</AudioSection>
					<AudioSection title="Compressor">
						<AudioRange
							label="Threshold"
							value={dsp.compThreshold}
							min={-30}
							max={0}
							format={(v) => (v === 0 ? "Off" : `${v} dB`)}
							onChange={(v) => updateDsp("compThreshold", v)}
						/>
						<AudioSelect
							label="Compression ratio"
							value={String(dsp.compRatio)}
							options={[
								["2", "2:1"],
								["4", "4:1"],
								["6", "6:1"],
								["10", "10:1"],
							]}
							onChange={(v) => updateDsp("compRatio", Number(v))}
						/>
					</AudioSection>
					<AudioSection title="Stereo">
						<AudioSelect
							label="Channels"
							value={dsp.channelMode}
							options={[
								["stereo", "Stereo"],
								["mono", "Mono"],
								["custom", "Custom width"],
								["mono-left", "Mono left"],
								["mono-right", "Mono right"],
								["karaoke", "Karaoke"],
								["swap", "Swap left / right"],
							]}
							onChange={(v) =>
								updateDsp("channelMode", v as DspSettings["channelMode"])
							}
						/>
						<AudioRange
							label="Stereo width"
							value={dsp.stereoWidth}
							min={0}
							max={255}
							unit="%"
							disabled={dsp.channelMode !== "custom"}
							onChange={(v) => updateDsp("stereoWidth", v)}
						/>
					</AudioSection>
					<Pressable
						accessibilityRole="button"
						onPress={() =>
							apply({ ...defaults(), dsp: { ...defaultDsp }, balance: 0 })
						}
						style={{
							padding: 16,
							borderRadius: 999,
							borderWidth: 1,
							borderColor: c.border,
							alignItems: "center",
						}}
					>
						<Text style={{ color: c.cyan }}>Reset all audio settings</Text>
					</Pressable>
				</ScrollView>
			)}
		</View>
	);
}
