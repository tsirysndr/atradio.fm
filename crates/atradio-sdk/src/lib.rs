//! # atradio-sdk
//!
//! The official Rust SDK for [atradio.fm](https://atradio.fm) — a social
//! internet-radio platform built on the [AT Protocol](https://atproto.com),
//! built on top of [jacquard](https://crates.io/crates/jacquard).
//!
//! The design mirrors Bluesky's [`@atproto/api`](https://github.com/bluesky-social/atproto/tree/main/packages/api):
//! an [`AtradioAgent`] wraps a jacquard session and exposes both high-level
//! convenience verbs (`favorite`, `comment`, `set_play_status`) and a typed
//! namespace escape hatch. Reads go through the unauthenticated [`AppView`]
//! client.
//!
//! ```no_run
//! # async fn demo() -> atradio_sdk::Result<()> {
//! use atradio_sdk::AtradioAgent;
//!
//! let agent = AtradioAgent::builder()
//!     .session_store("~/.config/atradio/session.json")
//!     .build()?;
//! agent.login_password("alice.bsky.social", "app-password").await?;
//!
//! let recent = agent.appview().recent_stations(25).await?;
//! # let _ = recent;
//! # Ok(())
//! # }
//! ```
//!
//! **Status:** scaffold. Construction, auth, service-auth minting, and the
//! read-only [`AppView`] client are implemented; the record-write verbs and the
//! generated [`lexicons`] bindings land during the CLI migration (see
//! `docs/sdk-design.md`).

#![forbid(unsafe_code)]

pub mod agent;
pub mod appview;
pub mod auth;
pub mod error;
pub mod facets;
pub mod lexicons;
pub mod namespaces;

pub use agent::{AtradioAgent, AtradioAgentBuilder, StationDraft};
pub use appview::{AppView, StationInfo};
pub use auth::Profile;
pub use error::{Result, SdkError};

/// The default public AppView base URL.
pub const DEFAULT_APPVIEW: &str = "https://api.atradio.fm";
