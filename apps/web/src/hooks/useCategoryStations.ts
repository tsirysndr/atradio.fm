import { useInfiniteQuery } from "@tanstack/react-query";
import { browseRadioBrowserByTag } from "@/lib/api/radioBrowser";
import type { Station } from "@/lib/types";

/** Stations fetched per infinite-scroll page. */
export const CATEGORY_PAGE_SIZE = 40;

/**
 * Infinite-scrolling feed of every station in a genre, backed by
 * radio-browser's paginated `bytag` endpoint. A page shorter than the page
 * size means we've reached the end of the genre.
 */
export function useCategoryStations(tag: string) {
  return useInfiniteQuery({
    queryKey: ["category", tag],
    enabled: tag.trim().length > 0,
    staleTime: 1000 * 60 * 5,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      browseRadioBrowserByTag({
        tag,
        offset: pageParam,
        limit: CATEGORY_PAGE_SIZE,
        signal,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < CATEGORY_PAGE_SIZE
        ? undefined
        : allPages.reduce((n, p) => n + p.length, 0),
    select: (data) => {
      // Flatten pages and drop cross-page duplicates (radio-browser can repeat
      // a station across offsets when the ranking shifts under us).
      const seen = new Set<string>();
      const stations: Station[] = [];
      for (const page of data.pages) {
        for (const s of page) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          stations.push(s);
        }
      }
      return { stations, pages: data.pages, pageParams: data.pageParams };
    },
  });
}
