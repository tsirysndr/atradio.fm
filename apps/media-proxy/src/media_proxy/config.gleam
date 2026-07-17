//// Runtime configuration, sourced from env vars with sane defaults.

import envoy
import gleam/int
import gleam/result

/// Default HTTP listen port when `PORT` is unset or not a valid integer.
pub const default_port = 7081

/// User-Agent sent to upstream stream/metadata hosts.
pub const upstream_user_agent = "atradio.fm/1.0"

/// Per-IP request budget per window, and the window length in seconds.
pub const default_rate_limit = 120

pub const default_rate_window = 60

/// HTTP listen port. Read from the `PORT` env var, falling back to
/// [`default_port`]. Mirrors the convention of the other apps.
pub fn port() -> Int {
  env_int("PORT", default_port)
}

/// Max `/api/*` requests per IP per window (`RATE_LIMIT`, default 120).
pub fn rate_limit() -> Int {
  env_int("RATE_LIMIT", default_rate_limit)
}

/// Rate-limit window length in seconds (`RATE_WINDOW`, default 60).
pub fn rate_window() -> Int {
  env_int("RATE_WINDOW", default_rate_window)
}

fn env_int(name: String, default: Int) -> Int {
  case envoy.get(name) {
    Ok(raw) -> raw |> int.parse |> result.unwrap(default)
    Error(_) -> default
  }
}
