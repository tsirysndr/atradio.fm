import { Text, TextInput } from "./Typography";
import React, { useRef, useState } from "react";
import {
	View,
	ScrollView,
	Pressable,
	KeyboardAvoidingView,
	Platform,
	ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { request } from "../auth/client";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { stationSchema, type StationForm } from "../stationValidation";
import { validateStation } from "../stationValidation";
import type { CustomStationInput, Station } from "../types";
import { c } from "../theme";
const fields: {
	key: keyof CustomStationInput;
	label: string;
	hint: string;
	max: number;
	url?: boolean;
}[] = [
	{ key: "name", label: "Station name", hint: "Your station", max: 120 },
	{
		key: "streamUrl",
		label: "Stream URL",
		hint: "https://example.com/live.mp3",
		max: 2048,
		url: true,
	},
	{ key: "genre", label: "Genre (optional)", hint: "Jazz, ambient…", max: 60 },
	{
		key: "homepage",
		label: "Website (optional)",
		hint: "https://example.com",
		max: 2048,
		url: true,
	},
	{
		key: "logoUrl",
		label: "Artwork URL (optional)",
		hint: "https://example.com/logo.png",
		max: 2048,
		url: true,
	},
	{
		key: "description",
		label: "Description (optional)",
		hint: "Tell listeners about this station",
		max: 500,
	},
];
export default function RegisterStation({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: (s: Station) => void;
}) {
	const insets = useSafeAreaInsets();
	const client = useQueryClient();
	const {
		control,
		handleSubmit,
		formState: { isValid },
	} = useForm<StationForm>({
		resolver: zodResolver(stationSchema),
		mode: "onChange",
		defaultValues: {
			name: "",
			streamUrl: "",
			genre: "",
			homepage: "",
			logoUrl: "",
			description: "",
		},
	});
	const registration = useMutation({
		mutationFn: (draft: StationForm) =>
			request<{ station: Station }>(
				"stationAction",
				JSON.stringify({ action: "registerStation", draft }),
			),
		retry: false,
	});
	const [pending, setPending] = useState(false);
	const writing = useRef(false);
	const [error, setError] = useState("");
	async function save(draft: StationForm) {
		if (writing.current) return;
		setError("");
		try {
			const value = validateStation(draft);
			writing.current = true;
			setPending(true);
			const result = await registration.mutateAsync(value);
			void client.invalidateQueries({ queryKey: ["registered-stations"] });
			void client.invalidateQueries({ queryKey: ["profile-stations"] });
			onCreated(result.station);
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Could not register station. Please retry.",
			);
		} finally {
			writing.current = false;
			setPending(false);
		}
	}
	return (
		<KeyboardAvoidingView
			style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
		>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{
					padding: 24,
					paddingBottom: insets.bottom + 28,
					gap: 14,
				}}
			>
				<Pressable onPress={onClose} disabled={pending}>
					<Text style={{ color: c.cyan, paddingVertical: 10 }}>Cancel</Text>
				</Pressable>
				<Text
					style={{
						color: c.text,
						fontFamily: "Lexend",
						fontSize: 28,
						fontWeight: "800",
					}}
				>
					Register a station
				</Text>
				<Text style={{ color: c.muted, lineHeight: 23 }}>
					Share a radio station with atradio.fm. Use its direct audio stream or
					playlist URL, rather than the station’s website. The station is saved
					to your ATProto account and becomes public after indexing.
				</Text>
				{fields.map((field) => (
					<Controller
						key={field.key}
						control={control}
						name={field.key}
						render={({ field: input, fieldState }) => (
							<View style={{ gap: 8 }}>
								<Text style={{ color: c.text }}>{field.label}</Text>
								<TextInput
									accessibilityLabel={field.label}
									value={input.value || ""}
									onChangeText={input.onChange}
									onBlur={input.onBlur}
									ref={input.ref}
									placeholder={field.hint}
									placeholderTextColor={c.muted}
									editable={!pending}
									autoCapitalize={field.url ? "none" : "sentences"}
									autoCorrect={!field.url}
									keyboardType={field.url ? "url" : "default"}
									multiline={field.key === "description"}
									maxLength={field.max}
									style={{
										color: c.text,
										backgroundColor: c.surface,
										padding: 14,
										borderWidth: 1,
										borderColor: fieldState.error ? c.error : c.border,
										borderRadius: 12,
										fontSize: 16,
									}}
								/>
								{fieldState.error && (
									<Text accessibilityRole="alert" style={{ color: c.error }}>
										{fieldState.error.message}
									</Text>
								)}
							</View>
						)}
					/>
				))}
				{!!error && (
					<Text accessibilityRole="alert" style={{ color: c.error }}>
						{error}
					</Text>
				)}
				<Pressable
					onPress={handleSubmit(save)}
					disabled={pending || !isValid}
					style={{
						backgroundColor: c.cyan,
						padding: 17,
						borderRadius: 12,
						alignItems: "center",
						opacity: pending || !isValid ? 0.4 : 1,
					}}
				>
					{pending ? (
						<ActivityIndicator color={c.bg} />
					) : (
						<Text style={{ color: c.bg, fontWeight: "800" }}>
							Register station
						</Text>
					)}
				</Pressable>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
