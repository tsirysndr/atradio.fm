import type { Station, StationSource } from "@/lib/types";
import { searchRadioBrowser } from "./radioBrowser";
import { searchTuneIn } from "./tunein";

export interface SearchResult {
  stations: Station[];
  /** Providers that failed (e.g. TuneIn blocked by CORS) so the UI can hint. */
  failedSources: StationSource[];
}

function dedupe(stations: Station[]): Station[] {
  const seen = new Set<string>();
  const out: Station[] = [];
  for (const s of stations) {
    // Collapse duplicates that share a stream URL or a (name+source) identity.
    const key = s.streamUrl
      ? `url:${s.streamUrl.toLowerCase()}`
      : `name:${s.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Query every provider in parallel. A failing provider (TuneIn is the usual
 * suspect thanks to CORS) never fails the whole search — its absence is just
 * reported back via `failedSources`.
 */
export async function searchStations(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const providers: { source: StationSource; run: () => Promise<Station[]> }[] = [
    { source: "radio-browser", run: () => searchRadioBrowser(query, signal) },
    { source: "tunein", run: () => searchTuneIn(query, signal) },
  ];

  const settled = await Promise.allSettled(providers.map((p) => p.run()));

  const stations: Station[] = [];
  const failedSources: StationSource[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      stations.push(...result.value);
    } else {
      failedSources.push(providers[i].source);
    }
  });

  return { stations: dedupe(stations), failedSources };
}
