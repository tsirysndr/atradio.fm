//! A plain C ABI over `atradio-sdk`, for C-FFI consumers (the fiddle-based Ruby
//! SDK; later Clojure via JVM Panama).
//!
//! Contract:
//! - All strings are UTF-8, NUL-terminated. Every `*mut c_char` this module
//!   returns is heap-owned and must be freed with [`atradio_string_free`].
//! - Fallible calls return a JSON envelope string: `{"ok": <data>}` on success,
//!   `{"error": "<message>"}` on failure. Reads and writes use this.
//! - The agent is an opaque handle (`*mut Agent`). [`atradio_agent_login`]
//!   returns null on failure — call [`atradio_last_error`] for the message —
//!   and the handle must be released with [`atradio_agent_free`].

use std::cell::RefCell;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use atradio_sdk::{AtradioAgent, StationInfo};

use crate::RT;

thread_local! {
    static LAST_ERROR: RefCell<Option<CString>> = const { RefCell::new(None) };
}

fn set_last_error(msg: String) {
    LAST_ERROR.with(|e| *e.borrow_mut() = CString::new(msg).ok());
}

/// Read a borrowed C string into an owned `String` (empty on null / invalid).
fn cstr(p: *const c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(p).to_string_lossy().into_owned() }
}

fn to_c(s: String) -> *mut c_char {
    CString::new(s)
        .unwrap_or_else(|_| CString::new("").unwrap())
        .into_raw()
}

/// Wrap a result as a `{"ok"|"error"}` JSON envelope string.
fn respond<T: serde::Serialize>(r: Result<T, String>) -> *mut c_char {
    let value = match r {
        Ok(v) => serde_json::json!({ "ok": v }),
        Err(e) => serde_json::json!({ "error": e }),
    };
    to_c(value.to_string())
}

/// Free a string returned by any function in this module.
///
/// # Safety
/// `p` must be a pointer previously returned here (or null).
#[no_mangle]
pub unsafe extern "C" fn atradio_string_free(p: *mut c_char) {
    if !p.is_null() {
        drop(CString::from_raw(p));
    }
}

/// The last error recorded on this thread (for null-returning calls), or null.
/// Caller frees with [`atradio_string_free`].
#[no_mangle]
pub extern "C" fn atradio_last_error() -> *mut c_char {
    LAST_ERROR
        .with(|e| e.borrow().clone())
        .map(CString::into_raw)
        .unwrap_or(std::ptr::null_mut())
}

// ---- reads (unauthenticated; base URL passed per call) -------------------

fn appview(base: *const c_char) -> atradio_sdk::AppView {
    let base = cstr(base);
    if base.is_empty() {
        atradio_sdk::AppView::new(atradio_sdk::DEFAULT_APPVIEW)
    } else {
        atradio_sdk::AppView::new(base)
    }
}

#[no_mangle]
pub extern "C" fn atradio_recent_stations(base: *const c_char, limit: u32) -> *mut c_char {
    let av = appview(base);
    respond(
        RT.block_on(av.recent_stations(limit))
            .map_err(|e| e.to_string()),
    )
}

#[no_mangle]
pub extern "C" fn atradio_popular_stations(base: *const c_char, limit: u32) -> *mut c_char {
    let av = appview(base);
    respond(
        RT.block_on(av.popular_stations(limit))
            .map_err(|e| e.to_string()),
    )
}

#[no_mangle]
pub extern "C" fn atradio_global_recently_played(base: *const c_char, limit: u32) -> *mut c_char {
    let av = appview(base);
    respond(
        RT.block_on(av.global_recently_played(limit))
            .map_err(|e| e.to_string()),
    )
}

#[no_mangle]
pub extern "C" fn atradio_favorites(
    base: *const c_char,
    actor: *const c_char,
    limit: u32,
) -> *mut c_char {
    let av = appview(base);
    respond(
        RT.block_on(av.favorites(&cstr(actor), limit))
            .map_err(|e| e.to_string()),
    )
}

/// The deterministic favorite record key — identical across every atradio SDK.
/// Returns a plain (non-envelope) string; never fails.
#[no_mangle]
pub extern "C" fn atradio_favorite_rkey(station_id: *const c_char) -> *mut c_char {
    to_c(atradio_sdk::agent::favorite_rkey(&cstr(station_id)))
}

// ---- authenticated agent (opaque handle) ---------------------------------

/// Opaque agent handle.
pub struct Agent(AtradioAgent);

fn parse_station(json: *const c_char) -> Result<StationInfo, String> {
    serde_json::from_str(&cstr(json)).map_err(|e| e.to_string())
}

/// Log in with an app password. Returns null on failure ([`atradio_last_error`]).
#[no_mangle]
pub extern "C" fn atradio_agent_login(
    session_path: *const c_char,
    identifier: *const c_char,
    password: *const c_char,
    appview: *const c_char,
) -> *mut Agent {
    let mut builder = AtradioAgent::builder().session_store(cstr(session_path));
    let base = cstr(appview);
    if !base.is_empty() {
        builder = builder.appview(base);
    }
    let agent = match builder.build() {
        Ok(a) => a,
        Err(e) => {
            set_last_error(e.to_string());
            return std::ptr::null_mut();
        }
    };
    match RT.block_on(agent.login_password(&cstr(identifier), &cstr(password))) {
        Ok(_) => Box::into_raw(Box::new(Agent(agent))),
        Err(e) => {
            set_last_error(e.to_string());
            std::ptr::null_mut()
        }
    }
}

/// Release an agent handle.
///
/// # Safety
/// `p` must be a handle from [`atradio_agent_login`] (or null), freed once.
#[no_mangle]
pub unsafe extern "C" fn atradio_agent_free(p: *mut Agent) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}

/// # Safety
/// `agent` must be a live handle from [`atradio_agent_login`].
unsafe fn with_agent<'a>(agent: *mut Agent) -> &'a AtradioAgent {
    &(*agent).0
}

/// # Safety
/// `agent` must be a live handle; `station_json` a valid C string.
#[no_mangle]
pub unsafe extern "C" fn atradio_agent_favorite(
    agent: *mut Agent,
    station_json: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    match parse_station(station_json) {
        Ok(s) => respond(RT.block_on(a.favorite(&s)).map_err(|e| e.to_string())),
        Err(e) => respond::<()>(Err(e)),
    }
}

/// # Safety
/// See [`atradio_agent_favorite`].
#[no_mangle]
pub unsafe extern "C" fn atradio_agent_unfavorite(
    agent: *mut Agent,
    station_json: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    match parse_station(station_json) {
        Ok(s) => respond(
            RT.block_on(a.unfavorite(&s))
                .map(|_| true)
                .map_err(|e| e.to_string()),
        ),
        Err(e) => respond::<()>(Err(e)),
    }
}

/// # Safety
/// See [`atradio_agent_favorite`]; `text` a valid C string.
#[no_mangle]
pub unsafe extern "C" fn atradio_agent_comment(
    agent: *mut Agent,
    station_json: *const c_char,
    text: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    match parse_station(station_json) {
        Ok(s) => respond(
            RT.block_on(a.comment(&s, &cstr(text)))
                .map_err(|e| e.to_string()),
        ),
        Err(e) => respond::<()>(Err(e)),
    }
}

/// # Safety
/// See [`atradio_agent_favorite`].
#[no_mangle]
pub unsafe extern "C" fn atradio_agent_set_play_status(
    agent: *mut Agent,
    station_json: *const c_char,
) -> *mut c_char {
    let a = with_agent(agent);
    match parse_station(station_json) {
        Ok(s) => respond(
            RT.block_on(a.set_play_status(&s))
                .map(|_| true)
                .map_err(|e| e.to_string()),
        ),
        Err(e) => respond::<()>(Err(e)),
    }
}

/// # Safety
/// `agent` must be a live handle.
#[no_mangle]
pub unsafe extern "C" fn atradio_agent_delete_play_status(agent: *mut Agent) -> *mut c_char {
    let a = with_agent(agent);
    respond(
        RT.block_on(a.delete_play_status())
            .map(|_| true)
            .map_err(|e| e.to_string()),
    )
}

/// # Safety
/// `agent` must be a live handle.
#[no_mangle]
pub unsafe extern "C" fn atradio_agent_refresh_session(agent: *mut Agent) -> *mut c_char {
    let a = with_agent(agent);
    respond(
        RT.block_on(a.refresh_session())
            .map(|_| true)
            .map_err(|e| e.to_string()),
    )
}
