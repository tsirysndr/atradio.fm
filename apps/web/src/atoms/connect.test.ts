import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore } from "jotai";
import type { Command } from "@/lib/connect/protocol";
import { setConnectClient } from "@/lib/connect/client";
import type { Station } from "@/lib/types";
import {
  currentStationAtom,
  isPlayingAtom,
  playStationAtom,
  togglePlayAtom,
} from "./player";
import { devicesAtom, remoteTargetIdAtom, selectDeviceAtom } from "./connect";

const STATION: Station = {
  id: "rb:1",
  name: "Local FM",
  streamUrl: "http://x/local",
  source: "radio-browser",
};

/** A stub Connect client that records the commands sent to it. */
function stubClient() {
  const sent: { target: string; cmd: Command }[] = [];
  setConnectClient({
    command: (target: string, cmd: Command) => sent.push({ target, cmd }),
  } as never);
  return sent;
}

let sent: { target: string; cmd: Command }[];
let store: ReturnType<typeof createStore>;

beforeEach(() => {
  sent = stubClient();
  store = createStore();
});

afterEach(() => {
  setConnectClient(null);
});

describe("playStationAtom routing", () => {
  it("plays locally when no remote is selected", () => {
    store.set(playStationAtom, STATION);
    expect(store.get(currentStationAtom)?.id).toBe("rb:1");
    expect(store.get(isPlayingAtom)).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("sends the station to the remote when one is selected", () => {
    store.set(remoteTargetIdAtom, "B");
    store.set(playStationAtom, STATION);
    // No local playback…
    expect(store.get(currentStationAtom)).toBeNull();
    // …a command went to the remote instead.
    expect(sent).toEqual([
      {
        target: "B",
        cmd: {
          action: "playStation",
          station: { id: "rb:1", name: "Local FM", url: "http://x/local" },
        },
      },
    ]);
  });

  it("routes play/pause to the remote", () => {
    store.set(remoteTargetIdAtom, "B");
    store.set(togglePlayAtom);
    expect(sent).toEqual([{ target: "B", cmd: { action: "playPause" } }]);
  });
});

describe("selectDeviceAtom transfer", () => {
  it("hands local playback to the chosen device", () => {
    store.set(currentStationAtom, STATION);
    store.set(isPlayingAtom, true);
    store.set(selectDeviceAtom, "B");

    expect(store.get(remoteTargetIdAtom)).toBe("B");
    expect(store.get(isPlayingAtom)).toBe(false); // local silenced
    expect(sent[0]).toEqual({
      target: "B",
      cmd: {
        action: "playStation",
        station: { id: "rb:1", name: "Local FM", url: "http://x/local" },
      },
    });
  });

  it("pulls playback back to this device and stops the remote", () => {
    store.set(devicesAtom, [
      {
        id: "B",
        name: "Kitchen",
        platform: "cli",
        state: {
          playing: true,
          station: { id: "rb:2", name: "Remote FM", url: "http://x/remote" },
          volume: 0.6,
          muted: false,
        },
      },
    ]);
    store.set(remoteTargetIdAtom, "B");

    store.set(selectDeviceAtom, null);

    expect(store.get(remoteTargetIdAtom)).toBeNull();
    expect(store.get(currentStationAtom)?.id).toBe("rb:2");
    expect(store.get(isPlayingAtom)).toBe(true);
    expect(sent).toContainEqual({ target: "B", cmd: { action: "stop" } });
  });
});
