import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { CustomStationInput, Station } from "@/lib/types";

/** User-entered stations, persisted locally (no backend yet). */
export const customStationsAtom = atomWithStorage<Station[]>(
  "atradio:custom",
  [],
);

function createId(): string {
  // Stable, unique-enough id without pulling in a uuid dep.
  const rand = Math.random().toString(36).slice(2, 10);
  return `custom:${Date.now().toString(36)}-${rand}`;
}

export const addCustomStationAtom = atom(
  null,
  (get, set, input: CustomStationInput) => {
    const station: Station = {
      id: createId(),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      genre: input.genre?.trim() || undefined,
      streamUrl: input.streamUrl.trim(),
      homepage: input.homepage?.trim() || undefined,
      favicon: input.logoUrl?.trim() || undefined,
      source: "custom",
    };
    set(customStationsAtom, [station, ...get(customStationsAtom)]);
    return station;
  },
);

export const removeCustomStationAtom = atom(
  null,
  (get, set, id: string) => {
    set(
      customStationsAtom,
      get(customStationsAtom).filter((s) => s.id !== id),
    );
  },
);
