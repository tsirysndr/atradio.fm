import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxiedStreamUrl, resolveStream } from "./resolve";
import { MEDIA_PROXY } from "@/lib/appview";
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
  // Every absolute http(s) stream is proxied so the Rockbox decoder worker can
  // fetch it cross-origin (CORS) and the DSP/EQ stays in the signal path.
  it("proxies every absolute http(s) stream (any scheme / page protocol)", () => {
    for (const [page, url] of [
      ["https:", "https://host/stream.aac"],
      ["https:", "http://host/stream.aac"], // mixed content
      ["http:", "http://host/stream.aac"], // dev
      ["http:", "https://host/stream.pls"], // playlist, server unwraps
      ["https:", "https://host/stream.PLS?x=1"],
    ] as const) {
      setProtocol(page);
      expect(proxiedStreamUrl(url)).toBe(
        `${MEDIA_PROXY}/api/stream?url=${encodeURIComponent(url)}`,
      );
    }
  });

  it("never proxies HLS .m3u8 (segments resolve against the manifest origin)", () => {
    setProtocol("https:");
    expect(proxiedStreamUrl("https://host/live.m3u8")).toBe(
      "https://host/live.m3u8",
    );
    expect(proxiedStreamUrl("http://host/live.m3u8?token=1")).toBe(
      "http://host/live.m3u8?token=1",
    );
  });

  it("leaves relative / same-origin urls untouched (e.g. the TuneIn probe)", () => {
    setProtocol("https:");
    expect(proxiedStreamUrl("/api/tunein/Tune.ashx?id=s1")).toBe(
      "/api/tunein/Tune.ashx?id=s1",
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
