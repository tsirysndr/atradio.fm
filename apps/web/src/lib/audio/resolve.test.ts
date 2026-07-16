import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxiedStreamUrl, resolveStream } from "./resolve";
import { APPVIEW_URL } from "@/lib/appview";
import type { Station } from "@/lib/types";

function station(over: Partial<Station>): Station {
  return {
    id: "rb:1",
    name: "Test",
    streamUrl: "http://host/stream",
    source: "radio-browser",
    ...over,
  };
}

/** Force `window.location.protocol` for the mixed-content branch. */
function setProtocol(protocol: "http:" | "https:") {
  Object.defineProperty(window, "location", {
    value: { ...window.location, protocol },
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proxiedStreamUrl", () => {
  it("proxies .pls/.m3u playlists so the server can unwrap them (any scheme)", () => {
    setProtocol("http:"); // even on an http page, playlists must be unwrapped
    for (const url of [
      "https://host/stream.pls",
      "http://host/stream.m3u",
      "https://host/stream.PLS?x=1",
    ]) {
      expect(proxiedStreamUrl(url)).toBe(
        `${APPVIEW_URL}/api/stream?url=${encodeURIComponent(url)}`,
      );
    }
  });

  it("proxies http streams on an https page (mixed content)", () => {
    setProtocol("https:");
    const url = "http://host/stream.aac";
    expect(proxiedStreamUrl(url)).toBe(
      `${APPVIEW_URL}/api/stream?url=${encodeURIComponent(url)}`,
    );
  });

  it("leaves https direct streams untouched", () => {
    setProtocol("https:");
    expect(proxiedStreamUrl("https://host/stream.aac")).toBe(
      "https://host/stream.aac",
    );
  });

  it("does not proxy http direct streams on an http page (dev)", () => {
    setProtocol("http:");
    expect(proxiedStreamUrl("http://host/stream.aac")).toBe(
      "http://host/stream.aac",
    );
  });
});

describe("resolveStream", () => {
  beforeEach(() => setProtocol("https:"));

  it("does NOT fetch a plain .pls (the proxy unwraps it) and returns it as-is", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await resolveStream(station({ streamUrl: "http://host/x.pls" }));
    expect(res).toEqual({ url: "http://host/x.pls", isHls: false });
    // Critical: reading /api/stream as text would hang on the live audio.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("flags HLS .m3u8 without fetching", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await resolveStream(
      station({ streamUrl: "https://host/live.m3u8" }),
    );
    expect(res).toEqual({ url: "https://host/live.m3u8", isHls: true });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("unwraps a TuneIn Tune.ashx playlist body to the first stream url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("File1=http://host/real.mp3\n", { status: 200 }),
        ),
      ),
    );
    const res = await resolveStream(
      station({ source: "tunein", streamUrl: "/api/tunein/Tune.ashx?id=s1" }),
    );
    expect(res).toEqual({ url: "http://host/real.mp3", isHls: false });
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  });

  it("detects HLS when a TuneIn body resolves to an .m3u8", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("http://host/live.m3u8\n", { status: 200 }),
        ),
      ),
    );
    const res = await resolveStream(
      station({ source: "tunein", streamUrl: "/api/tunein/Tune.ashx?id=s1" }),
    );
    expect(res).toEqual({ url: "http://host/live.m3u8", isHls: true });
  });

  it("falls back to the original url when the TuneIn fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    const res = await resolveStream(
      station({ source: "tunein", streamUrl: "/api/tunein/Tune.ashx?id=s1" }),
    );
    expect(res).toEqual({ url: "/api/tunein/Tune.ashx?id=s1", isHls: false });
  });
});
