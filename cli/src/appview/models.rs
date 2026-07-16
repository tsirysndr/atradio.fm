//! Wire types for the atradio.fm AppView (`fm.atradio.*` XRPC), mirroring
//! `packages/lexicons/src/types.ts`. All responses are plain JSON.

use serde::{Deserialize, Serialize};

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
