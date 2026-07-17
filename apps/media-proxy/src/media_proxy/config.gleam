//// Runtime configuration, sourced from env vars with sane defaults.

import envoy
import gleam/int
import gleam/result

/// Default HTTP listen port when `PORT` is unset or not a valid integer.
pub const default_port = 7081

/// User-Agent sent to upstream stream/metadata hosts.
pub const upstream_user_agent = "atradio.fm/1.0"

/// HTTP listen port. Read from the `PORT` env var, falling back to
/// [`default_port`]. Mirrors the convention of the other apps.
pub fn port() -> Int {
  case envoy.get("PORT") {
    Ok(raw) -> raw |> int.parse |> result.unwrap(default_port)
    Error(_) -> default_port
  }
}
