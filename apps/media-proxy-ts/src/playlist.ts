/**
 * `.pls` / `.m3u` playlist helpers shared by the stream + ICY proxies.
 *
 * A playlist is a small text file that *points* at the real stream; handing its
 * body to a decoder plays nothing. The stream proxy unwraps these to the
 * underlying stream URL before piping. HLS (`.m3u8`) is deliberately NOT
 * unwrappable — its segment URIs resolve against the manifest URL.
 */

/** True for `.pls`/`.m3u` playlist URLs the stream proxy should unwrap. */
export function isUnwrappable(url: string): boolean {
  return /\.(pls|m3u)(\?|$)/i.test(url);
}

/** True for any playlist URL, including HLS `.m3u8`. */
export function isPlaylist(url: string): boolean {
  return /\.(pls|m3u|m3u8)(\?|$)/i.test(url);
}

/**
 * Extract the first playable stream URL from a `.pls`/`.m3u` (or plain text)
 * playlist body. Returns `null` when nothing playable is found.
 */
export function firstStreamUrl(body: string): string | null {
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
