//! Erlang NIF (Rustler) bindings for `atradio-sdk`.
//!
//! The SDK is async and its calls do network I/O, which must never block a BEAM
//! scheduler — so every I/O nif is scheduled on a **dirty IO** scheduler, where
//! `block_on` is safe. Results cross the boundary as JSON strings (Erlang
//! binaries) in a `{"ok"|"error"}` envelope, matching the other atradio SDKs;
//! the authenticated agent is a Rustler resource (opaque handle).

use atradio_sdk::{AtradioAgent, StationInfo};
use once_cell::sync::Lazy;
use rustler::{Resource, ResourceArc};

/// One multi-threaded tokio runtime drives every async SDK call. Dirty-IO nif
/// threads may block on it freely.
static RT: Lazy<tokio::runtime::Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
});

/// Opaque authenticated-agent handle, held on the Erlang side as a resource.
struct AgentRes(AtradioAgent);

#[rustler::resource_impl]
impl Resource for AgentRes {}

fn appview(base: &str) -> atradio_sdk::AppView {
    if base.is_empty() {
        atradio_sdk::AppView::new(atradio_sdk::DEFAULT_APPVIEW)
    } else {
        atradio_sdk::AppView::new(base)
    }
}

/// Serialize a result into a `{"ok"|"error"}` JSON envelope string.
fn envelope<T: serde::Serialize, E: std::fmt::Display>(r: Result<T, E>) -> String {
    match r {
        Ok(v) => serde_json::json!({ "ok": v }).to_string(),
        Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
    }
}

// ---- reads (unauthenticated; dirty IO) -----------------------------------

#[rustler::nif(schedule = "DirtyIo")]
fn recent_stations(base: String, limit: u32) -> String {
    envelope(RT.block_on(appview(&base).recent_stations(limit)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn popular_stations(base: String, limit: u32) -> String {
    envelope(RT.block_on(appview(&base).popular_stations(limit)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn global_recently_played(base: String, limit: u32) -> String {
    envelope(RT.block_on(appview(&base).global_recently_played(limit)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn favorites(base: String, actor: String, limit: u32) -> String {
    envelope(RT.block_on(appview(&base).favorites(&actor, limit)))
}

/// Pure + fast — stays on a normal scheduler.
#[rustler::nif]
fn favorite_rkey(station_id: String) -> String {
    atradio_sdk::agent::favorite_rkey(&station_id)
}

// ---- authenticated agent (dirty IO) --------------------------------------

fn parse_station(json: &str) -> Result<StationInfo, String> {
    serde_json::from_str(json).map_err(|e| e.to_string())
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_login(
    session_path: String,
    identifier: String,
    password: String,
    appview: String,
) -> Result<ResourceArc<AgentRes>, rustler::Error> {
    let mut builder = AtradioAgent::builder().session_store(session_path);
    if !appview.is_empty() {
        builder = builder.appview(appview);
    }
    let agent = builder
        .build()
        .map_err(|e| rustler::Error::Term(Box::new(e.to_string())))?;
    RT.block_on(agent.login_password(&identifier, &password))
        .map_err(|e| rustler::Error::Term(Box::new(e.to_string())))?;
    Ok(ResourceArc::new(AgentRes(agent)))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_favorite(agent: ResourceArc<AgentRes>, station_json: String) -> String {
    match parse_station(&station_json) {
        Ok(s) => envelope(RT.block_on(agent.0.favorite(&s))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_unfavorite(agent: ResourceArc<AgentRes>, station_json: String) -> String {
    match parse_station(&station_json) {
        Ok(s) => envelope(RT.block_on(agent.0.unfavorite(&s)).map(|_| true)),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_comment(agent: ResourceArc<AgentRes>, station_json: String, text: String) -> String {
    match parse_station(&station_json) {
        Ok(s) => envelope(RT.block_on(agent.0.comment(&s, &text))),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_set_play_status(agent: ResourceArc<AgentRes>, station_json: String) -> String {
    match parse_station(&station_json) {
        Ok(s) => envelope(RT.block_on(agent.0.set_play_status(&s)).map(|_| true)),
        Err(e) => envelope::<(), _>(Err(e)),
    }
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_delete_play_status(agent: ResourceArc<AgentRes>) -> String {
    envelope(RT.block_on(agent.0.delete_play_status()).map(|_| true))
}

#[rustler::nif(schedule = "DirtyIo")]
fn agent_refresh_session(agent: ResourceArc<AgentRes>) -> String {
    envelope(RT.block_on(agent.0.refresh_session()).map(|_| true))
}

rustler::init!("atradio_nif");
