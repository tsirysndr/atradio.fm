//// Live read smoke test. Run: gleam run -m smoke

import atradio_gleam
import gleam/int
import gleam/io
import gleam/list
import gleam/string

pub fn main() {
  let recent = atradio_gleam.recent_stations(3)
  let first = case list.first(recent) {
    Ok(s) -> s.name
    Error(_) -> "-"
  }
  io.println(
    "recent_stations: " <> int.to_string(list.length(recent)) <> " — first: " <> first,
  )
  io.println(
    "popular_stations: "
    <> int.to_string(list.length(atradio_gleam.popular_stations(3))),
  )
  io.println(
    "global_recently_played: "
    <> int.to_string(list.length(atradio_gleam.global_recently_played(3))),
  )

  let rk = atradio_gleam.favorite_rkey("rb:00000000-0000-0000-0000-000000000000")
  io.println(
    "favorite_rkey: " <> rk <> " (" <> int.to_string(string.length(rk)) <> ")",
  )
  case string.length(rk) == 16 {
    True -> io.println("Gleam read smoke OK")
    False -> panic as "favorite rkey must be 16 chars"
  }
}
