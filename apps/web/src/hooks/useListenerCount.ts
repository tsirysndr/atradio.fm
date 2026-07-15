import { useQuery } from "@tanstack/react-query";
import { getListenerCounts } from "@/lib/appview";

/**
 * Unique-listener count for a single station (distinct actors who've played it),
 * from the AppView. Returns null while loading. Queries are keyed per station id
 * so React Query dedupes/caches repeats across the many cards on a page.
 */
export function useListenerCount(stationId: string | undefined): number | null {
  const { data } = useQuery({
    queryKey: ["listener-count", stationId],
    queryFn: async () => {
      const counts = await getListenerCounts([stationId!]);
      return counts.find((c) => c.stationId === stationId)?.listeners ?? 0;
    },
    enabled: !!stationId,
    staleTime: 60_000,
  });
  return data ?? null;
}
