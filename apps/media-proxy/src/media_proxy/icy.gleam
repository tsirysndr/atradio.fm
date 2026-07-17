//// ICY (Icecast/SHOUTcast) "now playing" title reader.
////
//// The byte-walking happens in `proxy_gun_ffi.erl` (a bounded `gun` read of the
//// interleaved metadata blocks) — httpc can't be used here, it would buffer an
//// endless stream forever. Port of `readIcyTitle` from `apps/api`.

import gleam/option.{type Option, None, Some}

@external(erlang, "proxy_gun_ffi", "read_icy_title")
fn read_title_ffi(url: String) -> Result(String, Nil)

/// The current `StreamTitle` for a stream, or `None` if it exposes no metadata.
pub fn read_title(url: String) -> Option(String) {
  case read_title_ffi(url) {
    Ok(title) -> Some(title)
    Error(_) -> None
  }
}
