//// `.pls` / `.m3u` playlist helpers shared by the stream + ICY proxies.
////
//// A playlist is a small text file that *points* at the real stream; handing
//// its body to a decoder plays nothing. The stream proxy unwraps these to the
//// underlying stream URL before piping. HLS (`.m3u8`) is deliberately NOT
//// unwrappable — its segment URIs resolve against the manifest URL.
//// Port of `apps/api/src/lib/playlist.ts`.

import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/regexp.{type Options, Options}
import gleam/string

/// True for `.pls`/`.m3u` playlist URLs the stream proxy should unwrap.
pub fn is_unwrappable(url: String) -> Bool {
  matches(url, "\\.(pls|m3u)(\\?|$)")
}

/// True for any playlist URL, including HLS `.m3u8`.
pub fn is_playlist(url: String) -> Bool {
  matches(url, "\\.(pls|m3u|m3u8)(\\?|$)")
}

/// Extract the first playable stream URL from a `.pls`/`.m3u` (or plain text)
/// playlist body. `None` when nothing playable is found.
pub fn first_stream_url(body: String) -> Option(String) {
  case pls_first(body) {
    Some(url) -> Some(url)
    None -> m3u_first(body)
  }
}

// `.pls` -> `File1=http://...`
fn pls_first(body: String) -> Option(String) {
  case regexp.compile("^\\s*File\\d+\\s*=\\s*(\\S+)", ci(True)) {
    Ok(re) ->
      case regexp.scan(re, body) {
        [match, ..] ->
          case match.submatches {
            [Some(url), ..] -> Some(string.trim(url))
            _ -> None
          }
        [] -> None
      }
    Error(_) -> None
  }
}

// `.m3u` / plain text -> first non-comment line that looks like a URL.
fn m3u_first(body: String) -> Option(String) {
  body
  |> string.split("\n")
  |> list.map(string.trim)
  |> list.find(fn(s) {
    s != "" && !string.starts_with(s, "#") && matches(s, "^https?://")
  })
  |> option.from_result
}

fn matches(s: String, pattern: String) -> Bool {
  case regexp.compile(pattern, ci(False)) {
    Ok(re) -> regexp.check(re, s)
    Error(_) -> False
  }
}

fn ci(multi_line: Bool) -> Options {
  Options(case_insensitive: True, multi_line: multi_line)
}
