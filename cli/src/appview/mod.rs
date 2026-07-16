// The AppView client mirrors the full public XRPC surface; not every endpoint
// is wired into the TUI yet, so allow the unused ones to stand as API.
#![allow(dead_code)]

pub mod client;
pub mod models;

pub use client::AppView;
pub use models::*;
