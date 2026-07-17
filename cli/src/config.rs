//! Runtime configuration, sourced from env vars with sane defaults.

use std::path::PathBuf;

/// Production AppView base URL (matches `apps/web/src/lib/appview.ts`).
const DEFAULT_APPVIEW: &str = "https://api.atradio.fm";

#[derive(Clone, Debug)]
pub struct Config {
    /// AppView base URL, e.g. `https://api.atradio.fm` (no trailing slash).
    pub appview_url: String,
    /// atproto identifier (handle / DID / email) for password auth, if set.
    pub identifier: Option<String>,
    /// atproto app password, if set.
    pub app_password: Option<String>,
    /// Where the persisted session token lives.
    pub session_path: PathBuf,
}

impl Config {
    pub fn from_env() -> Self {
        let appview_url = std::env::var("ATRADIO_APPVIEW_URL")
            .or_else(|_| std::env::var("APPVIEW_URL"))
            .or_else(|_| std::env::var("VITE_APPVIEW_URL"))
            .unwrap_or_else(|_| DEFAULT_APPVIEW.to_string())
            .trim_end_matches('/')
            .to_string();

        let identifier = env_nonempty("ATPROTO_IDENTIFIER")
            .or_else(|| env_nonempty("ATRADIO_IDENTIFIER"))
            .or_else(|| env_nonempty("BLUESKY_IDENTIFIER"));

        let app_password = env_nonempty("ATPROTO_APP_PASSWORD")
            .or_else(|| env_nonempty("ATPROTO_PASSWORD"))
            .or_else(|| env_nonempty("ATRADIO_APP_PASSWORD"))
            .or_else(|| env_nonempty("BLUESKY_APP_PASSWORD"));

        Self {
            appview_url,
            identifier,
            app_password,
            session_path: session_path(),
        }
    }
}

fn env_nonempty(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

/// `~/.config/atradio/session.json` (XDG on Linux, App Support on macOS).
fn session_path() -> PathBuf {
    directories::ProjectDirs::from("fm", "atradio", "atradio")
        .map(|d| d.config_dir().join("session.json"))
        .unwrap_or_else(|| PathBuf::from(".atradio-session.json"))
}
