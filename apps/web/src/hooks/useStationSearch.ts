import { useQuery } from "@tanstack/react-query";
import { searchStations } from "@/lib/api/search";

export function useStationSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 1000 * 60 * 5,
    queryFn: ({ signal }) => searchStations(trimmed, signal),
  });
}
