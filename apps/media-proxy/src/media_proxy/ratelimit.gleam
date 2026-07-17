//// Per-node fixed-window rate limiter (ETS). See `proxy_ratelimit_ffi.erl`.

pub type Decision {
  Allowed(remaining: Int)
  Limited(retry_after: Int)
}

/// Create the ETS table + start the sweeper. Call once at startup from a
/// long-lived process (main).
@external(erlang, "proxy_ratelimit_ffi", "init")
pub fn init() -> Nil

@external(erlang, "proxy_ratelimit_ffi", "check")
fn check_ffi(key: String, limit: Int, window_seconds: Int) -> Result(Int, Int)

/// Count one request for `key` in the current window.
pub fn check(key: String, limit: Int, window_seconds: Int) -> Decision {
  case check_ffi(key, limit, window_seconds) {
    Ok(remaining) -> Allowed(remaining)
    Error(retry_after) -> Limited(retry_after)
  }
}
