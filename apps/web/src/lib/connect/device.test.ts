import { describe, expect, it } from "vitest";
import type { Station } from "@/lib/types";
import {
  buildPlaybackState,
  liteToStation,
  stationToLite,
} from "./device";

const station: Station = {
  id: "rb:abc",
  name: "Synthwave FM",
  streamUrl: "http://example.com/stream",
  favicon: "http://example.com/fav.png",
  source: "radio-browser",
};

describe("connect device helpers", () => {
  it("reduces a Station to the wire shape", () => {
    expect(stationToLite(station)).toEqual({
      id: "rb:abc",
      name: "Synthwave FM",
      url: "http://example.com/stream",
      favicon: "http://example.com/fav.png",
    });
  });

  it("round-trips a station through lite and back", () => {
    const lite = stationToLite(station);
    const back = liteToStation(lite);
    expect(back.id).toBe(station.id);
    expect(back.name).toBe(station.name);
    expect(back.streamUrl).toBe(station.streamUrl);
    expect(back.favicon).toBe(station.favicon);
  });

  it("infers the source from the station id prefix", () => {
    expect(liteToStation({ id: "tunein:s1", name: "t", url: "u" }).source).toBe(
      "tunein",
    );
    expect(liteToStation({ id: "custom:x", name: "c", url: "u" }).source).toBe(
      "custom",
    );
    expect(liteToStation({ id: "rb:x", name: "r", url: "u" }).source).toBe(
      "radio-browser",
    );
  });

  it("marks playback state as not playing when no station is loaded", () => {
    const s = buildPlaybackState({
      station: null,
      playing: true,
      title: null,
      volume: 0.4,
      muted: false,
    });
    expect(s.playing).toBe(false);
    expect(s.station).toBeNull();
    expect(s.volume).toBe(0.4);
  });

  it("reflects a playing station with its now-playing title", () => {
    const s = buildPlaybackState({
      station,
      playing: true,
      title: "Artist — Track",
      volume: 0.8,
      muted: false,
    });
    expect(s.playing).toBe(true);
    expect(s.station?.name).toBe("Synthwave FM");
    expect(s.title).toBe("Artist — Track");
  });
});
