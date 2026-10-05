import React from "react";
import { View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useQuery } from "@tanstack/react-query";
import { listenerCount } from "../api/listeners";
import { Text } from "./Typography";

export default function ListenerCount({
	stationId,
	compact = false,
}: {
	stationId: string;
	compact?: boolean;
}) {
	const { data } = useQuery({
		queryKey: ["listener-count", stationId],
		queryFn: ({ signal }) => listenerCount(stationId, signal),
		enabled: !!stationId,
		staleTime: 60000,
		refetchInterval: 60000,
	});
	if (!data) return null;
	const label = `${data.toLocaleString()} ${data === 1 ? "listener" : "listeners"}`;
	return (
		<View
			accessible
			accessibilityLabel={`${label}, unique listeners who have played this station`}
			style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
		>
			<Feather name="headphones" size={compact ? 13 : 16} color="#ad9bff" />
			<Text style={{ color: "#ad9bff", fontSize: compact ? 12 : 14 }}>
				{compact ? data.toLocaleString() : label}
			</Text>
		</View>
	);
}
