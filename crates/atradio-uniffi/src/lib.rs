//! UniFFI bindings core for the atradio SDK.
//!
//! Wraps the async `atradio-sdk` behind a synchronous facade (a shared tokio
//! runtime + `block_on`) and exposes it via UniFFI, so the same Rust core powers
//! the Python, Ruby, and other language SDKs. Host languages get plain blocking
//! calls and provide their own concurrency.

use std::sync::Arc;

use once_cell::sync::Lazy;

uniffi::setup_scaffolding!();

/// A plain C ABI over the same core (opaque handles + JSON), for languages that
/// bind via a C FFI rather than UniFFI — the fiddle-based Ruby SDK, and later
/// Clojure via the JVM Panama FFM API.
pub mod capi;

/// One multi-threaded tokio runtime drives every async SDK call across the FFI
/// boundary. `block_on` from a host (non-runtime) thread is safe here.
pub(crate) static RT: Lazy<tokio::runtime::Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
});

/// Errors surfaced to host languages (one flat message; the SDK's typed errors
/// are stringified at the boundary).
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum AtradioError {
    #[error("{message}")]
    Generic { message: String },
}

fn err<E: std::fmt::Display>(e: E) -> AtradioError {
    AtradioError::Generic {
        message: e.to_string(),
    }
}

// ---- records (marshaled by value across the boundary) --------------------

/// A self-contained station snapshot (`fm.atradio.defs#stationInfo`).
#[derive(Debug, Clone, uniffi::Record)]
pub struct StationInfo {
    pub station_id: String,
    pub name: String,
    pub stream_url: String,
    pub source: String,
    pub description: Option<String>,
    pub genre: Option<String>,
    pub homepage: Option<String>,
    pub logo: Option<String>,
    pub country: Option<String>,
    pub language: Option<String>,
    pub bitrate: Option<u32>,
    pub codec: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ActorInfo {
    pub did: String,
    pub handle: Option<String>,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct StationView {
    pub uri: String,
    pub station: StationInfo,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PopularItem {
    pub station: StationInfo,
    pub count: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct PlayView {
    pub station: StationInfo,
    pub played_at: Option<String>,
    pub actor: Option<ActorInfo>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct StationList {
    pub cursor: Option<String>,
    pub total: u32,
    pub items: Vec<StationView>,
}

// ---- conversions to/from the SDK's own types -----------------------------

impl From<StationInfo> for atradio_sdk::StationInfo {
    fn from(s: StationInfo) -> Self {
        atradio_sdk::StationInfo {
            station_id: s.station_id,
            name: s.name,
            stream_url: s.stream_url,
            source: s.source,
            description: s.description,
            genre: s.genre,
            homepage: s.homepage,
            logo: s.logo,
            country: s.country,
            language: s.language,
            bitrate: s.bitrate,
            codec: s.codec,
            tags: s.tags,
        }
    }
}

impl From<atradio_sdk::StationInfo> for StationInfo {
    fn from(s: atradio_sdk::StationInfo) -> Self {
        StationInfo {
            station_id: s.station_id,
            name: s.name,
            stream_url: s.stream_url,
            source: s.source,
            description: s.description,
            genre: s.genre,
            homepage: s.homepage,
            logo: s.logo,
            country: s.country,
            language: s.language,
            bitrate: s.bitrate,
            codec: s.codec,
            tags: s.tags,
        }
    }
}

impl From<atradio_sdk::appview::ActorInfo> for ActorInfo {
    fn from(a: atradio_sdk::appview::ActorInfo) -> Self {
        ActorInfo {
            did: a.did,
            handle: a.handle,
            display_name: a.display_name,
            avatar: a.avatar,
        }
    }
}

impl From<atradio_sdk::appview::StationView> for StationView {
    fn from(v: atradio_sdk::appview::StationView) -> Self {
        StationView {
            uri: v.uri,
            station: v.station.into(),
            created_at: v.created_at,
        }
    }
}

impl From<atradio_sdk::appview::PopularItem> for PopularItem {
    fn from(p: atradio_sdk::appview::PopularItem) -> Self {
        PopularItem {
            station: p.station.into(),
            count: p.count,
        }
    }
}

impl From<atradio_sdk::appview::PlayView> for PlayView {
    fn from(p: atradio_sdk::appview::PlayView) -> Self {
        PlayView {
            station: p.station.into(),
            played_at: p.played_at,
            actor: p.actor.map(Into::into),
        }
    }
}

impl From<atradio_sdk::appview::StationListOutput> for StationList {
    fn from(o: atradio_sdk::appview::StationListOutput) -> Self {
        StationList {
            cursor: o.cursor,
            total: o.total,
            items: o.items.into_iter().map(Into::into).collect(),
        }
    }
}

// ---- read client ---------------------------------------------------------

/// Unauthenticated read client over the public atradio.fm AppView.
#[derive(uniffi::Object)]
pub struct AppView {
    inner: atradio_sdk::AppView,
}

#[uniffi::export]
impl AppView {
    #[uniffi::constructor]
    pub fn new(base: Option<String>) -> Arc<Self> {
        let base = base.unwrap_or_else(|| atradio_sdk::DEFAULT_APPVIEW.to_string());
        Arc::new(Self {
            inner: atradio_sdk::AppView::new(base),
        })
    }

    pub fn recent_stations(&self, limit: u32) -> Result<Vec<StationView>, AtradioError> {
        let out = RT
            .block_on(self.inner.recent_stations(limit))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn popular_stations(&self, limit: u32) -> Result<Vec<PopularItem>, AtradioError> {
        let out = RT
            .block_on(self.inner.popular_stations(limit))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn global_recently_played(&self, limit: u32) -> Result<Vec<PlayView>, AtradioError> {
        let out = RT
            .block_on(self.inner.global_recently_played(limit))
            .map_err(err)?;
        Ok(out.into_iter().map(Into::into).collect())
    }

    pub fn favorites(&self, actor: String, limit: u32) -> Result<StationList, AtradioError> {
        let out = RT
            .block_on(self.inner.favorites(&actor, limit))
            .map_err(err)?;
        Ok(out.into())
    }
}

// ---- authenticated agent -------------------------------------------------

/// The atradio agent: app-password login + record writes.
#[derive(uniffi::Object)]
pub struct Agent {
    inner: atradio_sdk::AtradioAgent,
}

#[uniffi::export]
impl Agent {
    /// Log in with an app password, persisting the session at `session_path`.
    #[uniffi::constructor]
    pub fn login_password(
        session_path: String,
        identifier: String,
        password: String,
        appview: Option<String>,
    ) -> Result<Arc<Self>, AtradioError> {
        let mut builder = atradio_sdk::AtradioAgent::builder().session_store(session_path);
        if let Some(base) = appview {
            builder = builder.appview(base);
        }
        let agent = builder.build().map_err(err)?;
        RT.block_on(agent.login_password(&identifier, &password))
            .map_err(err)?;
        Ok(Arc::new(Self { inner: agent }))
    }

    pub fn did(&self) -> Option<String> {
        self.inner.profile().map(|p| p.did)
    }

    /// Proactively refresh the session (keep-alive).
    pub fn refresh_session(&self) -> Result<(), AtradioError> {
        RT.block_on(self.inner.refresh_session()).map_err(err)
    }

    /// Favorite a station (idempotent; deterministic record key). Returns URI.
    pub fn favorite(&self, station: StationInfo) -> Result<String, AtradioError> {
        RT.block_on(self.inner.favorite(&station.into()))
            .map_err(err)
    }

    /// Unfavorite a station (removes every record for its stationId).
    pub fn unfavorite(&self, station: StationInfo) -> Result<(), AtradioError> {
        RT.block_on(self.inner.unfavorite(&station.into()))
            .map_err(err)
    }

    /// Post a comment on a station. Returns the record URI.
    pub fn comment(&self, station: StationInfo, text: String) -> Result<String, AtradioError> {
        RT.block_on(self.inner.comment(&station.into(), &text))
            .map_err(err)
    }

    /// Update the actor's play-status singleton.
    pub fn set_play_status(&self, station: StationInfo) -> Result<(), AtradioError> {
        RT.block_on(self.inner.set_play_status(&station.into()))
            .map_err(err)
    }

    /// Delete the actor's play-status singleton.
    pub fn delete_play_status(&self) -> Result<(), AtradioError> {
        RT.block_on(self.inner.delete_play_status()).map_err(err)
    }
}

/// The deterministic favorite record key for a station id — identical across all
/// atradio SDKs (Rust core, Go, TypeScript, and every FFI language).
#[uniffi::export]
pub fn favorite_rkey(station_id: String) -> String {
    atradio_sdk::agent::favorite_rkey(&station_id)
}
