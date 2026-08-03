import { describe, expect, it } from "bun:test";
import { DEFAULT_PORT, port } from "../src/config.ts";
import { firstStreamUrl, isPlaylist, isUnwrappable } from "../src/playlist.ts";

// ---- config.port (PORT env var) --------------------------------------------

describe("config.port", () => {
  it("defaults when unset", () => {
    delete process.env.PORT;
    expect(port()).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(7081);
  });

  it("reads the env var", () => {
    process.env.PORT = "9123";
    expect(port()).toBe(9123);
    delete process.env.PORT;
  });

  it("falls back on garbage", () => {
    process.env.PORT = "not-a-number";
    expect(port()).toBe(DEFAULT_PORT);
    delete process.env.PORT;
  });
});

// ---- playlist classification -----------------------------------------------

describe("isUnwrappable", () => {
  it("matches .pls and .m3u (with or without query strings)", () => {
    expect(isUnwrappable("http://host/stream.pls")).toBe(true);
    expect(isUnwrappable("https://host/stream.m3u")).toBe(true);
    expect(isUnwrappable("https://host/stream.PLS?x=1")).toBe(true);
  });

  it("does NOT unwrap HLS .m3u8 (segment URIs resolve against the manifest)", () => {
    expect(isUnwrappable("https://host/live.m3u8")).toBe(false);
    expect(isUnwrappable("https://host/live.m3u8?t=1")).toBe(false);
  });

  it("does not match direct streams", () => {
    expect(isUnwrappable("https://host/stream.aac")).toBe(false);
    expect(isUnwrappable("https://host/stream")).toBe(false);
  });
});

describe("isPlaylist", () => {
  it("includes HLS", () => {
    expect(isPlaylist("https://host/live.m3u8")).toBe(true);
    expect(isPlaylist("https://host/x.pls")).toBe(true);
    expect(isPlaylist("https://host/stream.aac")).toBe(false);
  });
});

// ---- playlist unwrapping ---------------------------------------------------

describe("firstStreamUrl", () => {
  it("extracts File1 from a .pls body", () => {
    const body = "[playlist]\nNumberOfEntries=1\nFile1=http://host/real.mp3\n";
    expect(firstStreamUrl(body)).toBe("http://host/real.mp3");
  });

  it("returns the first File entry in document order", () => {
    const body = "File2=http://b/2\nFile1=http://a/1";
    expect(firstStreamUrl(body)).toBe("http://b/2");
  });

  it("extracts the first url line from an .m3u, skipping comments", () => {
    const body = "#EXTM3U\n#EXTINF:-1,Station\nhttps://host/stream\r\n";
    expect(firstStreamUrl(body)).toBe("https://host/stream");
  });

  it("returns null when nothing playable is found", () => {
    expect(firstStreamUrl("#EXTM3U\n# nothing here\n")).toBeNull();
  });
});
