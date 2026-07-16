import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";
import { cpSync } from "node:fs";
import { dirname } from "node:path";

// rockbox-wasm's runtime (core + decoder worker + audio worklet) is fetched by
// URL at runtime, so it can't go through the module graph. Mirror the package
// dist into public/rockbox (gitignored) — served at /rockbox/*, which is the
// RockboxPlayer baseUrl (see src/lib/audio/rockbox.ts).
cpSync(
  dirname(fileURLToPath(import.meta.resolve("rockbox-wasm"))),
  fileURLToPath(new URL("./public/rockbox", import.meta.url)),
  { recursive: true },
);

/**
 * Read the current ICY `StreamTitle` from a stream, server-side (no CORS).
 * Requests with `Icy-MetaData: 1`, then walks the interleaved metadata blocks
 * described by the `icy-metaint` response header. Returns null when the stream
 * exposes no metadata. Bounded so a metadata-less stream can't read forever.
 */
/** Resolve a .pls/.m3u playlist URL to its first stream URL (server-side). */
async function resolvePlaylist(target: string): Promise<string> {
  if (!/\.(pls|m3u|m3u8)(\?|$)/i.test(target)) return target;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(target, { redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return target;
    const body = await res.text();
    const pls = body.match(/^\s*File\d+\s*=\s*(\S+)/im);
    if (pls) return pls[1].trim();
    for (const line of body.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith("#") && /^https?:\/\//i.test(t)) return t;
    }
  } catch {
    /* fall through */
  } finally {
    clearTimeout(t);
  }
  return target;
}

async function readIcyTitle(rawTarget: string): Promise<string | null> {
  const target = await resolvePlaylist(rawTarget);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(target, {
      headers: { "Icy-MetaData": "1", "User-Agent": "atradio.fm/1.0" },
      signal: controller.signal,
      redirect: "follow",
    });
    const metaint = Number(resp.headers.get("icy-metaint"));
    if (!resp.body || !metaint || Number.isNaN(metaint)) {
      try {
        await resp.body?.cancel();
      } catch {
        /* ignore */
      }
      return null;
    }

    const reader = resp.body.getReader();
    const maxBytes = metaint * 2 + 4096;
    let bytesUntilMeta = metaint;
    let metaLength = -1;
    let metaCollected = 0;
    let metaBuffer = new Uint8Array(0);
    let total = 0;

    try {
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        total += value.length;
        let i = 0;
        while (i < value.length) {
          if (bytesUntilMeta > 0) {
            const skip = Math.min(bytesUntilMeta, value.length - i);
            i += skip;
            bytesUntilMeta -= skip;
          } else if (metaLength === -1) {
            metaLength = value[i] * 16;
            i += 1;
            if (metaLength === 0) {
              bytesUntilMeta = metaint;
              metaLength = -1;
            } else {
              metaBuffer = new Uint8Array(metaLength);
              metaCollected = 0;
            }
          } else {
            const take = Math.min(metaLength - metaCollected, value.length - i);
            metaBuffer.set(value.subarray(i, i + take), metaCollected);
            metaCollected += take;
            i += take;
            if (metaCollected >= metaLength) {
              const text = Buffer.from(metaBuffer).toString("utf8");
              const m = text.match(/StreamTitle='((?:[^']|'(?!;))*)'/);
              return m?.[1]?.trim() || null;
            }
          }
        }
      }
      return null;
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Dev middleware: GET /api/icy?url=<stream> -> { title }. */
function icyMetadataProxy() {
  return {
    name: "icy-metadata-proxy",
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use(
        "/api/icy",
        async (req: { url?: string }, res: NodeJS.WritableStream & { setHeader: Function; end: Function }) => {
          res.setHeader("Content-Type", "application/json");
          try {
            const u = new URL(req.url ?? "/", "http://localhost");
            const target = u.searchParams.get("url");
            if (!target || !/^https?:\/\//i.test(target)) {
              res.end(JSON.stringify({ title: null }));
              return;
            }
            const title = await readIcyTitle(target);
            res.end(JSON.stringify({ title }));
          } catch {
            res.end(JSON.stringify({ title: null }));
          }
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    icyMetadataProxy(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon-64.png",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        id: "/",
        name: "atradio.fm",
        short_name: "atradio",
        description:
          "A social internet radio platform built on AT Protocol. Save, organize, discover, and listen to radio stations with your own portable account.",
        theme_color: "#0a0e12",
        background_color: "#0a0e12",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["music", "entertainment"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // The engine loads /rockbox/* (baseUrl) — the assets/rockbox-* copies
        // Vite emits from the module's internal URL fallbacks are never used.
        globIgnores: ["**/assets/rockbox-*"],
        // Take control immediately and purge stale precaches so a new deploy
        // never leaves users on an old build.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        // Don't hijack the TuneIn dev proxy requests.
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // radio-browser API responses (mirror hosts) — fresh, with fallback.
            urlPattern: /^https:\/\/[a-z0-9-]+\.api\.radio-browser\.info\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "radio-browser-api",
              expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Station logos / favicons.
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "station-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    // Don't prebundle rockbox-wasm: its dynamic `new URL(\`./${name}\`,
    // import.meta.url)` gets rewritten by Vite into a glob over the module's
    // siblings — inside .vite/deps that means importing every optimized dep's
    // .js.map as a module, which fails MIME checks and blanks the app.
    exclude: ["rockbox-wasm"],
  },
  server: {
    // Bind the IPv4 loopback: AT Proto OAuth requires 127.0.0.1 (not the
    // `localhost` hostname, which can resolve to IPv6 ::1). The app also
    // auto-redirects localhost -> 127.0.0.1 in dev (see main.tsx).
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      // TuneIn's OPML endpoint sends no CORS headers, so the browser blocks
      // direct fetches. In dev we tunnel every TuneIn request through Vite's
      // proxy (same-origin -> no CORS). For a deployed build, point
      // VITE_TUNEIN_PROXY at an equivalent server-side proxy.
      "/api/tunein": {
        target: "https://opml.radiotime.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/tunein/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
