//// A tiny per-node TTL cache (ETS) for TuneIn + ICY responses. Node-local by
//// design — the proxy is stateless and scales horizontally, so no Redis.
//// See `proxy_cache_ffi.erl`.

/// Create the ETS table. Call once at startup from a long-lived process (main)
/// so the table's owner outlives request handlers.
@external(erlang, "proxy_cache_ffi", "init")
pub fn init() -> Nil

/// Fetch a live (non-expired) entry.
@external(erlang, "proxy_cache_ffi", "get")
pub fn get(key: String) -> Result(String, Nil)

/// Store `value` under `key` for `ttl_seconds`.
@external(erlang, "proxy_cache_ffi", "set")
pub fn set(key: String, value: String, ttl_seconds: Int) -> Nil
