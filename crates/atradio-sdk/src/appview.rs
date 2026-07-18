//! The read side of the SDK: a thin async client over the public atradio.fm
//! AppView XRPC (`fm.atradio.*`). Everything here is unauthenticated
//! JSON-over-HTTP, so [`AppView`] is usable standalone — a discovery bot needs
//! nothing else.
//!
//! The wire types (below) are hand-written to match the AppView's JSON, not the
//! generated lexicon records; they mirror `packages/lexicons/src/types.ts`.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::error::{Result, SdkError};

/// A thin async client over the public atradio.fm AppView XRPC.
#[derive(Clone)]
pub struct AppView {
    http: reqwest::Client,
    base: String,
}

impl AppView {
    /// Build a client against an AppView base URL (e.g. `https://api.atradio.fm`).
    pub fn new(base: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("atradio-sdk/", env!("CARGO_PKG_VERSION")))
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
        let res = self.http.get(&url).query(&filtered).send().await?;
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(SdkError::AppView {
                nsid: nsid.to_string(),
                status: status.as_u16(),
                body,
            });
        }
        serde_json::from_str(&body)
            .map_err(|e| SdkError::Other(format!("decode {nsid}: {e}: {body}")))
    }

    /// Newest stations platform-wide.
    pub async fn recent_stations(&self, limit: u32) -> Result<Vec<StationView>> {
        let out: RecentStationsOutput = self
            .query(
                "fm.atradio.getRecentStations",
                &[("limit", limit.to_string())],
            )
            .await?;
        Ok(out.items)
    }

    /// Most-favorited stations platform-wide.
    pub async fn popular_stations(&self, limit: u32) -> Result<Vec<PopularItem>> {
        let out: PopularStationsOutput = self
            .query(
                "fm.atradio.getPopularStations",
                &[("limit", limit.to_string())],
            )
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

    /// Advance the actor's last-seen notification marker. Returns the new unread
    /// count.
    pub async fn update_seen(&self, actor: &str) -> Result<u32> {
        let url = format!("{}/xrpc/fm.atradio.updateSeen", self.base);
        let res = self
            .http
            .post(&url)
            .json(&serde_json::json!({ "actor": actor }))
            .send()
            .await?;
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Out {
            #[serde(default)]
            unread_count: u32,
        }
        let out: Out = res.json().await?;
        Ok(out.unread_count)
    }
}

// ---- wire types ----------------------------------------------------------

/// The canonical, self-contained station snapshot (`fm.atradio.defs#stationInfo`).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationInfo {
    /// `rb:<uuid>` | `tunein:<id>` | `custom:<rkey>`.
    pub station_id: String,
    pub name: String,
    pub stream_url: String,
    /// `radio-browser` | `tunein` | `custom`.
    #[serde(default)]
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

impl StationInfo {
    /// A compact "genre · country · bitrate" subtitle.
    pub fn subtitle(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        if let Some(g) = self.genre.as_ref().filter(|g| !g.is_empty()) {
            parts.push(g.clone());
        }
        if let Some(c) = self.country.as_ref().filter(|c| !c.is_empty()) {
            parts.push(c.clone());
        }
        if let Some(br) = self.bitrate.filter(|b| *b > 0) {
            parts.push(format!("{br}k"));
        }
        parts.join(" · ")
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorInfo {
    pub did: String,
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
}

impl ActorInfo {
    pub fn name(&self) -> String {
        self.display_name
            .clone()
            .or_else(|| self.handle.clone())
            .unwrap_or_else(|| "someone".to_string())
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationView {
    #[serde(default)]
    pub uri: String,
    pub station: StationInfo,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationListOutput {
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub total: u32,
    #[serde(default)]
    pub items: Vec<StationView>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct RecentStationsOutput {
    #[serde(default)]
    pub items: Vec<StationView>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PopularItem {
    pub station: StationInfo,
    #[serde(default)]
    pub count: u32,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct PopularStationsOutput {
    #[serde(default)]
    pub items: Vec<PopularItem>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayView {
    pub station: StationInfo,
    #[serde(default)]
    pub played_at: Option<String>,
    #[serde(default)]
    pub actor: Option<ActorInfo>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayListOutput {
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub items: Vec<PlayView>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenerCount {
    pub station_id: String,
    #[serde(default)]
    pub listeners: u32,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct ListenerCountsOutput {
    #[serde(default)]
    pub counts: Vec<ListenerCount>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gif {
    pub url: String,
    #[serde(default)]
    pub preview_url: Option<String>,
    #[serde(default)]
    pub alt: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentView {
    #[serde(default)]
    pub uri: String,
    #[serde(default)]
    pub author: Option<ActorInfo>,
    #[serde(default)]
    pub station: Option<StationInfo>,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub gif: Option<Gif>,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentListOutput {
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub total: u32,
    #[serde(default)]
    pub items: Vec<CommentView>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationView {
    #[serde(default)]
    pub uri: String,
    /// `mention` | `comment`.
    #[serde(default)]
    pub reason: String,
    pub author: ActorInfo,
    #[serde(default)]
    pub station: Option<StationInfo>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub is_read: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationListOutput {
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub unread_count: u32,
    #[serde(default)]
    pub items: Vec<NotificationView>,
}
