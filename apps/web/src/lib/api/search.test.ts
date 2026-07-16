import { afterEach, describe, expect, it, vi } from "vitest";
import { searchStations } from "./search";
import { proxyTuneInUrl } from "./tunein";

const RB_STATION = {
  stationuuid: "abc-123",
  name: "Synthwave FM",
  url: "http://example.com/stream",
  url_resolved: "http://example.com/stream.mp3",
  homepage: "http://example.com",
  favicon: "http://example.com/fav.png",
  tags: "synthwave,electronic",
  country: "Germany",
  language: "english",
  codec: "MP3",
  bitrate: 128,
  votes: 10,
  clickcount: 42,
};

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url));
  }));
}

describe("proxyTuneInUrl", () => {
  it("rewrites opml.radiotime.com through the proxy path", () => {
    expect(
      proxyTuneInUrl("https://opml.radiotime.com/Tune.ashx?id=s1"),
    ).toBe("/api/tunein/Tune.ashx?id=s1");
  });

  it("leaves non-tunein urls untouched", () => {
    expect(proxyTuneInUrl("https://example.com/x")).toBe(
      "https://example.com/x",
    );
  });
});

describe("searchStations", () => {
  it("normalizes radio-browser stations", async () => {
    mockFetch((url) => {
      if (url.includes("/json/servers")) {
        return new Response(
          JSON.stringify([{ name: "de1.api.radio-browser.info" }]),
          { status: 200 },
        );
      }
      if (url.includes("radio-browser")) {
        return new Response(JSON.stringify([RB_STATION]), { status: 200 });
      }
      return new Response(JSON.stringify({ body: [] }), { status: 200 });
    });

    const { stations } = await searchStations("synthwave");
    const rb = stations.find((s) => s.source === "radio-browser");
    expect(rb).toBeDefined();
    expect(rb!.id).toBe("rb:abc-123");
    expect(rb!.streamUrl).toBe("http://example.com/stream.mp3");
    expect(rb!.genre).toBe("synthwave");
    expect(rb!.tags).toEqual(["synthwave", "electronic"]);
  });

  it("reports a failed provider instead of throwing", async () => {
    mockFetch((url) => {
      if (url.includes("/json/servers")) {
        return new Response(
          JSON.stringify([{ name: "de1.api.radio-browser.info" }]),
          { status: 200 },
        );
      }
      if (url.includes("radio-browser")) {
        return new Response(JSON.stringify([RB_STATION]), { status: 200 });
      }
      // TuneIn (proxy) fails -> should be reported, not fatal.
      return new Response("boom", { status: 500 });
    });

    const { stations, failedSources } = await searchStations("synthwave");
    expect(stations).toHaveLength(1);
    expect(failedSources).toContain("tunein");
  });

  it("dedupes stations that share a stream url", async () => {
    mockFetch((url) => {
      if (url.includes("/json/servers")) {
        return new Response(
          JSON.stringify([{ name: "de1.api.radio-browser.info" }]),
          { status: 200 },
        );
      }
      if (url.includes("radio-browser")) {
        return new Response(
          JSON.stringify([RB_STATION, { ...RB_STATION, stationuuid: "dup" }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ body: [] }), { status: 200 });
    });

    const { stations } = await searchStations("synthwave");
    expect(stations).toHaveLength(1);
  });
});
