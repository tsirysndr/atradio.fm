import { describe, expect, it } from "vitest";
import {
  isPlaylistUrl,
  isUnwrappablePlaylist,
  parseFirstStreamUrl,
} from "./playlist";

describe("isUnwrappablePlaylist", () => {
  it("matches .pls and .m3u (with or without query strings)", () => {
    expect(isUnwrappablePlaylist("http://x/stream.pls")).toBe(true);
    expect(isUnwrappablePlaylist("http://x/stream.m3u")).toBe(true);
    expect(isUnwrappablePlaylist("http://x/stream.PLS?token=1")).toBe(true);
  });

  it("does NOT match HLS .m3u8 (must resolve against its manifest origin)", () => {
    expect(isUnwrappablePlaylist("http://x/live.m3u8")).toBe(false);
    expect(isUnwrappablePlaylist("http://x/live.m3u8?wowza")).toBe(false);
  });

  it("does not match plain audio streams", () => {
    expect(isUnwrappablePlaylist("http://x/stream.aac")).toBe(false);
    expect(isUnwrappablePlaylist("http://x/stream")).toBe(false);
  });
});

describe("isPlaylistUrl", () => {
  it("matches .pls, .m3u and .m3u8", () => {
    expect(isPlaylistUrl("http://x/a.pls")).toBe(true);
    expect(isPlaylistUrl("http://x/a.m3u")).toBe(true);
    expect(isPlaylistUrl("http://x/a.m3u8")).toBe(true);
    expect(isPlaylistUrl("http://x/a.aac")).toBe(false);
  });
});

describe("parseFirstStreamUrl", () => {
  it("extracts File1 from a .pls body (the reported avbhost case)", () => {
    const body = [
      "[Playlist]",
      "File1=http://audiovision.cdnstream1.com/2154_64.aac",
      "Title1=AudioVision: AlternativeRadio.us",
      "Length1=-1",
      "Numberofentries=1",
      "Version=2",
    ].join("\n");
    expect(parseFirstStreamUrl(body)).toBe(
      "http://audiovision.cdnstream1.com/2154_64.aac",
    );
  });

  it("returns the first File entry even when higher-numbered ones exist", () => {
    const body = "File2=http://b/2\nFile1=http://a/1";
    // First match in document order wins, not lowest index.
    expect(parseFirstStreamUrl(body)).toBe("http://b/2");
  });

  it("extracts the first url line from an .m3u, skipping comments", () => {
    const body = "#EXTM3U\n#EXTINF:-1,Station\nhttp://host/stream.mp3";
    expect(parseFirstStreamUrl(body)).toBe("http://host/stream.mp3");
  });

  it("handles CRLF line endings", () => {
    const body = "#EXTM3U\r\nhttps://host/stream\r\n";
    expect(parseFirstStreamUrl(body)).toBe("https://host/stream");
  });

  it("returns null when nothing playable is present", () => {
    expect(parseFirstStreamUrl("[Playlist]\nNumberofentries=0")).toBeNull();
    expect(parseFirstStreamUrl("")).toBeNull();
  });
});
