/**
 * Best-effort ICY (Icecast/SHOUTcast) "now playing" reader.
 *
 * The actual byte-stream parsing happens SERVER-SIDE, because a browser can't
 * read a third-party stream's body or its `icy-metaint` header (CORS), and the
 * non-standard `Icy-MetaData` request header would trigger a preflight almost
 * no stream host answers. So we ask our own proxy instead:
 *   - dev:  the `/api/icy` Vite middleware (see vite.config.ts) fetches the
 *           stream in Node (no CORS) and returns `{ title }`.
 *   - prod: point VITE_ICY_PROXY at an equivalent server-side endpoint.
 *
 * When the proxy is absent (e.g. a static prod deploy with no backend), the
 * request fails and we simply show no track title.
 */
const BASE = import.meta.env.VITE_ICY_PROXY ?? "/api/icy";

async function fetchIcyTitle(
  streamUrl: string,
  signal: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${BASE}?url=${encodeURIComponent(streamUrl)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { title?: string | null };
  const title = data.title?.trim();
  return title ? title : null;
}

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });

/**
 * Poll a stream URL for its current ICY `StreamTitle`, invoking `onTitle` each
 * time it changes. Runs until `signal` aborts. Never throws.
 */
export async function watchIcyMetadata(
  streamUrl: string,
  onTitle: (title: string | null) => void,
  signal: AbortSignal,
  intervalMs = 15000,
): Promise<void> {
  if (typeof fetch === "undefined") return;

  let last: string | null = null;
  while (!signal.aborted) {
    try {
      const title = await fetchIcyTitle(streamUrl, signal);
      if (!signal.aborted && title !== last) {
        last = title;
        onTitle(title);
      }
    } catch {
      // Network/abort/no-proxy — stay quiet, try again next tick.
    }
    if (signal.aborted) break;
    await delay(intervalMs, signal);
  }
}
