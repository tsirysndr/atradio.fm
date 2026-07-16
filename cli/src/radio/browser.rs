//! radio-browser.info search, normalized into our `StationInfo` shape.
//! Mirrors the logic in `apps/web/src/lib/api/radioBrowser.ts`.
#![allow(dead_code)] // by_tag / helpers are API for category browsing

use anyhow::{Context, Result};
use serde::Deserialize;

use crate::appview::StationInfo;

/// Discovery endpoint that lists the mirror servers.
const SERVERS_URL: &str = "https://all.api.radio-browser.info/json/servers";
/// Fallback mirror if discovery fails.
const FALLBACK_BASE: &str = "https://de1.api.radio-browser.info";

#[derive(Clone)]
pub struct RadioBrowser {
    http: reqwest::Client,
    base: std::sync::Arc<tokio::sync::RwLock<Option<String>>>,
}

#[derive(Deserialize)]
struct Server {
    name: String,
}

#[derive(Deserialize)]
struct RbStation {
    stationuuid: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    url_resolved: String,
    #[serde(default)]
    favicon: String,
    #[serde(default)]
    homepage: String,
    #[serde(default)]
    tags: String,
    #[serde(default)]
    country: String,
    #[serde(default)]
    language: String,
    #[serde(default)]
    codec: String,
    #[serde(default)]
    bitrate: u32,
}

impl RadioBrowser {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("atradio-cli/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client");
        Self {
            http,
            base: std::sync::Arc::new(tokio::sync::RwLock::new(None)),
        }
    }

    /// Resolve (and cache) a working mirror base URL.
    async fn base(&self) -> String {
        if let Some(b) = self.base.read().await.clone() {
            return b;
        }
        let resolved = self
            .discover()
            .await
            .unwrap_or_else(|_| FALLBACK_BASE.to_string());
        *self.base.write().await = Some(resolved.clone());
        resolved
    }

    async fn discover(&self) -> Result<String> {
        let servers: Vec<Server> = self
            .http
            .get(SERVERS_URL)
            .send()
            .await?
            .json()
            .await
            .context("radio-browser servers")?;
        servers
            .into_iter()
            .next()
            .map(|s| format!("https://{}", s.name))
            .context("no radio-browser mirrors")
    }

    /// Search stations by name, clickcount-ordered.
    pub async fn search(&self, query: &str, limit: u32) -> Result<Vec<StationInfo>> {
        let base = self.base().await;
        let url = format!("{base}/json/stations/search");
        let rows: Vec<RbStation> = self
            .http
            .get(&url)
            .query(&[
                ("name", query),
                ("limit", &limit.to_string()),
                ("hidebroken", "true"),
                ("order", "clickcount"),
                ("reverse", "true"),
            ])
            .send()
            .await?
            .json()
            .await
            .context("radio-browser search")?;
        Ok(rows.into_iter().map(to_station).collect())
    }

    /// Browse stations by tag/genre.
    pub async fn by_tag(&self, tag: &str, limit: u32) -> Result<Vec<StationInfo>> {
        let base = self.base().await;
        let url = format!("{base}/json/stations/bytag/{}", urlencode(tag));
        let rows: Vec<RbStation> = self
            .http
            .get(&url)
            .query(&[
                ("limit", limit.to_string()),
                ("hidebroken", "true".into()),
                ("order", "clickcount".into()),
                ("reverse", "true".into()),
            ])
            .send()
            .await?
            .json()
            .await
            .context("radio-browser bytag")?;
        Ok(rows.into_iter().map(to_station).collect())
    }

    /// Register a play (radio-browser click counter). Best-effort.
    pub async fn register_click(&self, station_id: &str) {
        let Some(uuid) = station_id.strip_prefix("rb:") else {
            return;
        };
        let base = self.base().await;
        let url = format!("{base}/json/url/{uuid}");
        let _ = self.http.get(&url).send().await;
    }
}

impl Default for RadioBrowser {
    fn default() -> Self {
        Self::new()
    }
}

fn to_station(s: RbStation) -> StationInfo {
    let tags: Vec<String> = s
        .tags
        .split(',')
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    let stream_url = if s.url_resolved.is_empty() {
        s.url
    } else {
        s.url_resolved
    };
    StationInfo {
        station_id: format!("rb:{}", s.stationuuid),
        name: s.name.trim().to_string(),
        stream_url,
        source: "radio-browser".into(),
        genre: tags.first().cloned(),
        homepage: opt(s.homepage),
        logo: opt(s.favicon),
        country: opt(s.country),
        language: opt(s.language),
        bitrate: (s.bitrate > 0).then_some(s.bitrate),
        codec: opt(s.codec),
        tags,
        description: None,
    }
}

fn opt(s: String) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| t.to_string())
}

fn urlencode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "%20".to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}
