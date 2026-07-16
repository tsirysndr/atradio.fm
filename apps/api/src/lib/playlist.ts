/**
 * `.pls` / `.m3u` playlist helpers shared by the stream and ICY proxies.
 *
 * A playlist is a small text file that *points* at the real stream; handing its
 * body to an audio decoder plays nothing. The stream proxy must unwrap these to
 * the underlying stream URL before piping. HLS (`.m3u8`) is deliberately NOT
 * treated as unwrappable here — its segment URIs resolve against the manifest
 * URL, so it's played as-is by the client.
 */

/** True for `.pls`/`.m3u` playlist URLs the stream proxy should unwrap. */
export function isUnwrappablePlaylist(url: string): boolean {
  return /\.(pls|m3u)(\?|$)/i.test(url);
}

/** True for any playlist URL, including HLS `.m3u8`. */
export function isPlaylistUrl(url: string): boolean {
  return /\.(pls|m3u|m3u8)(\?|$)/i.test(url);
}

/**
 * Extract the first playable stream URL from a `.pls`/`.m3u` (or plain text)
 * playlist body. Returns null when nothing playable is found.
 */
export function parseFirstStreamUrl(body: string): string | null {
  // .pls -> `File1=http://...`
  const pls = body.match(/^\s*File\d+\s*=\s*(\S+)/im);
  if (pls) return pls[1].trim();

  // .m3u / plain text -> first non-comment line that looks like a URL.
  for (const line of body.split(/\r?\n/)) {
    const s = line.trim();
    if (s && !s.startsWith("#") && /^https?:\/\//i.test(s)) return s;
  }
  return null;
}
