//! Thin async client over the public atradio.fm AppView XRPC (`fm.atradio.*`).
//! Everything here is unauthenticated JSON-over-HTTP.

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;

use super::models::*;

#[derive(Clone)]
pub struct AppView {
    http: reqwest::Client,
    base: String,
}

impl AppView {
    pub fn new(base: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("atradio-cli/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client");
        Self {
            http,
            base: base.into().trim_end_matches('/').to_string(),
        }
    }

    async fn query<T: DeserializeOwned>(&self, nsid: &str, params: &[(&str, String)]) -> Result<T> {
        let url = format!("{}/xrpc/{}", self.base, nsid);
        let filtered: Vec<(&str, String)> = params
            .iter()
            .filter(|(_, v)| !v.is_empty())
            .cloned()
            .collect();
        let res = self
            .http
            .get(&url)
            .query(&filtered)
            .send()
            .await
            .with_context(|| format!("GET {nsid}"))?;
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!("{nsid} -> {status}: {body}");
        }
        serde_json::from_str(&body).with_context(|| format!("decode {nsid}: {body}"))
    }

    /// Newest stations platform-wide.
    pub async fn recent_stations(&self, limit: u32) -> Result<Vec<StationView>> {
        let out: RecentStationsOutput = self
            .query("fm.atradio.getRecentStations", &[("limit", limit.to_string())])
            .await?;
        Ok(out.items)
    }

    /// Most-favorited stations platform-wide.
    pub async fn popular_stations(&self, limit: u32) -> Result<Vec<PopularItem>> {
        let out: PopularStationsOutput = self
            .query("fm.atradio.getPopularStations", &[("limit", limit.to_string())])
            .await?;
        Ok(out.items)
    }

    /// Platform-wide "who's listening" feed.
    pub async fn global_recently_played(&self, limit: u32) -> Result<Vec<PlayView>> {
        let out: PlayListOutput = self
            .query(
                "fm.atradio.getGlobalRecentlyPlayed",
                &[("limit", limit.to_string())],
            )
            .await?;
        Ok(out.items)
    }

    /// An actor's own recently played stations (one per station).
    pub async fn recently_played(&self, actor: &str, limit: u32) -> Result<Vec<PlayView>> {
        let out: PlayListOutput = self
            .query(
                "fm.atradio.getRecentlyPlayed",
                &[("actor", actor.into()), ("limit", limit.to_string())],
            )
            .await?;
        Ok(out.items)
    }

    /// An actor's favorited stations.
    pub async fn favorites(&self, actor: &str, limit: u32) -> Result<StationListOutput> {
        self.query(
            "fm.atradio.getFavorites",
            &[("actor", actor.into()), ("limit", limit.to_string())],
        )
        .await
    }

    /// An actor's own created (custom) stations.
    pub async fn stations(&self, actor: &str, limit: u32) -> Result<StationListOutput> {
        self.query(
            "fm.atradio.getStations",
            &[("actor", actor.into()), ("limit", limit.to_string())],
        )
        .await
    }

    /// Comments on a station, newest first.
    pub async fn comments(&self, station_id: &str, limit: u32) -> Result<CommentListOutput> {
        self.query(
            "fm.atradio.getComments",
            &[("station", station_id.into()), ("limit", limit.to_string())],
        )
        .await
    }

    /// Unique-listener counts for up to 100 station ids.
    pub async fn listener_counts(&self, station_ids: &[String]) -> Result<Vec<ListenerCount>> {
        if station_ids.is_empty() {
            return Ok(Vec::new());
        }
        let out: ListenerCountsOutput = self
            .query(
                "fm.atradio.getListenerCounts",
                &[("stations", station_ids.join(","))],
            )
            .await?;
        Ok(out.counts)
    }

    /// An actor's notifications (mentions + comments on their stations).
    pub async fn notifications(&self, actor: &str, limit: u32) -> Result<NotificationListOutput> {
        self.query(
            "fm.atradio.getNotifications",
            &[("actor", actor.into()), ("limit", limit.to_string())],
        )
        .await
    }

    /// Advance the actor's last-seen notification marker.
    pub async fn update_seen(&self, actor: &str) -> Result<u32> {
        let url = format!("{}/xrpc/fm.atradio.updateSeen", self.base);
        let res = self
            .http
            .post(&url)
            .json(&serde_json::json!({ "actor": actor }))
            .send()
            .await
            .context("updateSeen")?;
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Out {
            #[serde(default)]
            unread_count: u32,
        }
        let out: Out = res.json().await.context("decode updateSeen")?;
        Ok(out.unread_count)
    }
}
