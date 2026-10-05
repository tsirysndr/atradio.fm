import { atom } from "jotai";
import type { EqSettings } from "../playback/equalizer";
export const equalizerAtom = atom<EqSettings | undefined>(undefined);
export const equalizerRevisionAtom = atom(0);
export const equalizerSyncAtom = atom("Loading equalizer…");
