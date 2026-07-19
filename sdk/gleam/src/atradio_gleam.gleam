//// Official Gleam SDK for atradio.fm.
////
//// Typed bindings over the `atradio_erl` NIF package (the shared Rust core),
//// so the auth / record / reconcile logic is identical to the Rust, Go,
//// TypeScript, Python, Ruby, Clojure, and Erlang SDKs. `atradio_erl` downloads
//// the matching native library from the GitHub release on first load.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode

/// A radio station.
pub type Station {
  Station(id: String, name: String, stream_url: String, source: String)
}

/// An opaque authenticated-agent handle (a NIF resource freed by the BEAM GC).
pub type Agent =
  Dynamic

// ---- reads (unauthenticated) --------------------------------------------

@external(erlang, "atradio", "recent_stations")
fn recent_stations_ffi(limit: Int, base: String) -> Dynamic

@external(erlang, "atradio", "popular_stations")
fn popular_stations_ffi(limit: Int, base: String) -> Dynamic

@external(erlang, "atradio", "global_recently_played")
fn global_recently_played_ffi(limit: Int, base: String) -> Dynamic

@external(erlang, "atradio", "favorites")
fn favorites_ffi(actor: String, limit: Int, base: String) -> Dynamic

/// The station nested inside a StationView / PlayView / PopularItem.
fn station_decoder() -> decode.Decoder(Station) {
  use id <- decode.field("stationId", decode.string)
  use name <- decode.field("name", decode.string)
  use stream_url <- decode.field("streamUrl", decode.string)
  use source <- decode.optional_field("source", "", decode.string)
  decode.success(Station(id:, name:, stream_url:, source:))
}

fn view_decoder() -> decode.Decoder(Station) {
  decode.at(["station"], station_decoder())
}

fn decode_list(dyn: Dynamic) -> List(Station) {
  case decode.run(dyn, decode.list(view_decoder())) {
    Ok(list) -> list
    Error(_) -> []
  }
}

/// Newest stations platform-wide.
pub fn recent_stations(limit: Int) -> List(Station) {
  decode_list(recent_stations_ffi(limit, ""))
}

/// Most-favorited stations platform-wide.
pub fn popular_stations(limit: Int) -> List(Station) {
  decode_list(popular_stations_ffi(limit, ""))
}

/// Platform-wide who's-listening feed.
pub fn global_recently_played(limit: Int) -> List(Station) {
  decode_list(global_recently_played_ffi(limit, ""))
}

/// An actor's favorited stations.
pub fn favorites(actor: String, limit: Int) -> List(Station) {
  // getFavorites returns a paged object: %{"items" => [StationView], ...}.
  let decoder = decode.at(["items"], decode.list(view_decoder()))
  case decode.run(favorites_ffi(actor, limit, ""), decoder) {
    Ok(list) -> list
    Error(_) -> []
  }
}

/// The deterministic favorite record key — identical across every atradio SDK.
@external(erlang, "atradio", "favorite_rkey")
pub fn favorite_rkey(station_id: String) -> String

// ---- authenticated agent -------------------------------------------------

/// Log in with an app password, persisting the session at `session_path`.
@external(erlang, "atradio", "login")
pub fn login(
  session_path: String,
  identifier: String,
  password: String,
  appview: String,
) -> Agent

fn station_to_map(s: Station) -> Dict(String, String) {
  dict.from_list([
    #("stationId", s.id),
    #("name", s.name),
    #("streamUrl", s.stream_url),
    #("source", s.source),
  ])
}

@external(erlang, "atradio", "favorite")
fn favorite_ffi(agent: Agent, station: Dict(String, String)) -> Dynamic

@external(erlang, "atradio", "unfavorite")
fn unfavorite_ffi(agent: Agent, station: Dict(String, String)) -> Dynamic

@external(erlang, "atradio", "set_play_status")
fn set_play_status_ffi(agent: Agent, station: Dict(String, String)) -> Dynamic

@external(erlang, "atradio", "comment")
fn comment_ffi(agent: Agent, station: Dict(String, String), text: String) -> Dynamic

/// Favorite a station (idempotent; deterministic record key).
pub fn favorite(agent: Agent, station: Station) -> Nil {
  favorite_ffi(agent, station_to_map(station))
  Nil
}

/// Unfavorite a station (removes every record for its stationId).
pub fn unfavorite(agent: Agent, station: Station) -> Nil {
  unfavorite_ffi(agent, station_to_map(station))
  Nil
}

/// Update the actor's play-status singleton.
pub fn set_play_status(agent: Agent, station: Station) -> Nil {
  set_play_status_ffi(agent, station_to_map(station))
  Nil
}

/// Post a comment on a station.
pub fn comment(agent: Agent, station: Station, text: String) -> Nil {
  comment_ffi(agent, station_to_map(station), text)
  Nil
}
