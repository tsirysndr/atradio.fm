export interface ProbeResult {
  ok: boolean;
  reason?: string;
}

/**
 * Best-effort check that a URL points at something an <audio> element can
 * actually play. We attach the URL to a throwaway Audio element and wait for
 * `loadedmetadata`/`canplay` (success) or `error`/timeout (failure).
 *
 * Why an Audio element and not fetch()? Media element loads are NOT subject to
 * CORS the way fetch() is, so this reflects real playability of icecast/mp3/aac
 * streams that fetch() could never read. Caveats the caller should know:
 *   - HLS (.m3u8) needs hls.js at play time, so a raw probe may report a false
 *     negative — the modal offers an "add anyway" escape hatch.
 *   - .pls/.m3u/TuneIn playlist URLs are resolved elsewhere at play time and
 *     may also under-report here.
 */
export function probeStream(url: string, timeoutMs = 8000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    if (typeof Audio === "undefined") {
      resolve({ ok: true });
      return;
    }

    const audio = new Audio();
    audio.preload = "metadata";
    audio.muted = true;
    audio.volume = 0;

    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", onOk);
      audio.removeEventListener("canplay", onOk);
      audio.removeEventListener("error", onErr);
      // Stop any buffering so we don't keep a hidden stream open.
      audio.removeAttribute("src");
      audio.load();
      resolve(result);
    };

    const onOk = () => finish({ ok: true });
    const onErr = () =>
      finish({ ok: false, reason: "We couldn't load audio from this URL." });
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          reason: "The stream didn't respond in time. Is the URL correct?",
        }),
      timeoutMs,
    );

    audio.addEventListener("loadedmetadata", onOk);
    audio.addEventListener("canplay", onOk);
    audio.addEventListener("error", onErr);

    try {
      audio.src = url;
      audio.load();
    } catch {
      finish({ ok: false, reason: "That doesn't look like a valid URL." });
    }
  });
}
