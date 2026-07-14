import { atom } from "jotai";
import { consola } from "consola";
import { NSID } from "@atradio/lexicons";
import type { CustomStationInput, Station } from "@/lib/types";
import { clientAtom, didAtom } from "./auth";
import {
  putStation,
  deleteAtradioRecord,
  type StoredStation,
} from "@/lib/atproto/records";

/** The logged-in user's `fm.atradio.station` records (loaded from the PDS). */
export const customStationsAtom = atom<Station[]>([]);

/** station.id -> record rkey. */
export const customRkeysAtom = atom<Record<string, string>>({});

export const setCustomStationsAtom = atom(
  null,
  (_get, set, items: StoredStation[]) => {
    set(
      customStationsAtom,
      items.map((i) => i.station),
    );
    set(
      customRkeysAtom,
      Object.fromEntries(items.map((i) => [i.station.id, i.rkey])),
    );
  },
);

export const clearCustomStationsAtom = atom(null, (_get, set) => {
  set(customStationsAtom, []);
  set(customRkeysAtom, {});
});

/** Add a station: write the record to the PDS, then reflect it locally. */
export const addCustomStationAtom = atom(
  null,
  async (get, set, input: CustomStationInput): Promise<Station> => {
    const client = get(clientAtom);
    const did = get(didAtom);
    if (!client || !did) throw new Error("Not authenticated");

    const { rkey, station } = await putStation(client, did, {
      name: input.name,
      streamUrl: input.streamUrl,
      description: input.description,
      genre: input.genre,
      homepage: input.homepage,
      logoUrl: input.logoUrl,
    });
    set(customStationsAtom, [station, ...get(customStationsAtom)]);
    set(customRkeysAtom, { ...get(customRkeysAtom), [station.id]: rkey });
    return station;
  },
);

/** Remove a station: optimistic local delete + PDS delete, rollback on error. */
export const removeCustomStationAtom = atom(
  null,
  async (get, set, id: string) => {
    const client = get(clientAtom);
    const did = get(didAtom);
    const current = get(customStationsAtom);
    const rkeys = get(customRkeysAtom);
    const rkey = rkeys[id];

    set(
      customStationsAtom,
      current.filter((s) => s.id !== id),
    );
    const nextRkeys = { ...rkeys };
    delete nextRkeys[id];
    set(customRkeysAtom, nextRkeys);

    if (client && did && rkey) {
      try {
        await deleteAtradioRecord(client, did, NSID.station, rkey);
      } catch (err) {
        consola.error("[stations] remove failed", err);
        set(customStationsAtom, current);
        set(customRkeysAtom, rkeys);
      }
    }
  },
);
