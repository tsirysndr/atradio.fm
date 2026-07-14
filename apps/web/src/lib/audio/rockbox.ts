import { RockboxPlayer } from "rockbox-wasm";

/**
 * App-wide Rockbox audio engine (decoders + DSP in WebAssembly).
 *
 * One lazy singleton: the instance is cheap to create (event wiring only),
 * but `init()` boots an AudioContext, so it must be reachable from a user
 * gesture. The runtime assets (core/worker/worklet) are served from
 * /rockbox/* — see the copy step in vite.config.ts.
 */
let player: RockboxPlayer | null = null;

export function getRockboxPlayer(): RockboxPlayer {
  if (!player) player = new RockboxPlayer({ baseUrl: "/rockbox" });
  return player;
}

/** Boot the engine if needed (idempotent). Call from a user gesture. */
export async function ensureRockboxReady(): Promise<RockboxPlayer> {
  const p = getRockboxPlayer();
  if (!p.ready) await p.init();
  return p;
}
