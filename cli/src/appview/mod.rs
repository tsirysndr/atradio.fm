//! The public atradio.fm AppView client now lives in the SDK
//! ([`atradio_sdk::appview`]). This module re-exports it so the existing
//! `crate::appview::*` paths keep resolving.

#![allow(unused_imports)]

pub use atradio_sdk::appview::*;
pub use atradio_sdk::AppView;
