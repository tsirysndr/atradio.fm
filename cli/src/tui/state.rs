//! TUI application state.

use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;

use crate::appview::{CommentView, NotificationView, StationInfo};
use crate::player::AudioSettings;

/// Which full-screen view is active.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum View {
    /// The home/browse screen (trending + popular + favorites).
    Home,
    /// The equalizer / DSP settings panel.
    Dsp,
    /// Comments for the current station.
    Comments,
    /// Notifications.
    Notifications,
    /// The connected user's profile.
    Profile,
    /// Keybindings help.
    Help,
}

/// A transient overlay drawn on top of the active view.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Overlay {
    None,
    /// fzf-style fuzzy station search.
    Search,
    /// Comment composer.
    Compose,
    /// OAuth sign-in prompt (enter a handle / DID / PDS URL).
    SignIn,
    /// Add-a-custom-station form.
    AddStation,
    /// atradio Connect device picker.
    Devices,
}

/// The add-station form: an ordered set of text fields.
#[derive(Clone, Default)]
pub struct AddStationForm {
    pub name: String,
    pub stream_url: String,
    pub genre: String,
    pub homepage: String,
    pub logo: String,
    /// Index of the focused field (0..FIELD_COUNT).
    pub focus: usize,
}

impl AddStationForm {
    pub const FIELD_COUNT: usize = 5;

    pub fn labels() -> [&'static str; Self::FIELD_COUNT] {
        ["Name*", "Stream URL*", "Genre", "Homepage", "Logo URL"]
    }

    pub fn field(&self, i: usize) -> &str {
        match i {
            0 => &self.name,
            1 => &self.stream_url,
            2 => &self.genre,
            3 => &self.homepage,
            _ => &self.logo,
        }
    }

    pub fn field_mut(&mut self, i: usize) -> &mut String {
        match i {
            0 => &mut self.name,
            1 => &mut self.stream_url,
            2 => &mut self.genre,
            3 => &mut self.homepage,
            _ => &mut self.logo,
        }
    }

    /// True when the required fields (name + stream URL) are filled.
    pub fn is_valid(&self) -> bool {
        !self.name.trim().is_empty() && !self.stream_url.trim().is_empty()
    }
}

/// Home has several horizontally-laid lists; this tracks focus.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum HomeTab {
    Trending,
    Popular,
    /// Global "who's listening" — recently played across atradio.fm.
    Recent,
    Favorites,
    /// The connected user's own stations.
    Yours,
}

impl HomeTab {
    pub const ORDER: [HomeTab; 5] = [
        HomeTab::Popular,
        HomeTab::Recent,
        HomeTab::Trending,
        HomeTab::Favorites,
        HomeTab::Yours,
    ];

    pub fn all() -> [HomeTab; 5] {
        Self::ORDER
    }
    pub fn label(self) -> &'static str {
        match self {
            HomeTab::Trending => "Trending",
            HomeTab::Popular => "Popular",
            HomeTab::Recent => "Recent",
            HomeTab::Favorites => "Favorites",
            HomeTab::Yours => "Yours",
        }
    }
    fn index(self) -> usize {
        Self::ORDER.iter().position(|t| *t == self).unwrap_or(0)
    }
    pub fn next(self) -> HomeTab {
        Self::ORDER[(self.index() + 1) % Self::ORDER.len()]
    }
    pub fn prev(self) -> HomeTab {
        Self::ORDER[(self.index() + Self::ORDER.len() - 1) % Self::ORDER.len()]
    }
}

/// A short-lived status message shown in the footer.
#[derive(Clone, Default)]
pub struct Toast {
    pub text: String,
    /// Remaining ticks before it clears.
    pub ttl: u8,
}

impl Toast {
    pub fn set(&mut self, text: impl Into<String>) {
        self.text = text.into();
        self.ttl = 6; // ~3s at 500ms/tick
    }
    pub fn tick(&mut self) {
        if self.ttl > 0 {
            self.ttl -= 1;
            if self.ttl == 0 {
                self.text.clear();
            }
        }
    }
}

pub struct App {
    pub view: View,
    pub overlay: Overlay,
    pub should_quit: bool,

    // ---- home lists ----
    pub home_tab: HomeTab,
    pub trending: Vec<StationInfo>,
    pub popular: Vec<StationInfo>,
    pub favorites: Vec<StationInfo>,
    /// The connected user's own stations.
    pub stations: Vec<StationInfo>,
    /// Global recently-played stations (aligned 1:1 with `recent_actors`).
    pub recent: Vec<StationInfo>,
    /// Who played each `recent` station (display label, same index).
    pub recent_actors: Vec<String>,
    /// The connected user's own recently-played (for the profile view).
    pub profile_recent: Vec<StationInfo>,
    /// Selection index within the profile's recently-played list.
    pub profile_recent_selected: usize,
    pub selected: usize,

    // ---- search overlay ----
    pub search_query: String,
    pub search_results: Vec<StationInfo>,
    pub search_selected: usize,
    /// Set when the query changed and a fetch should fire.
    pub search_dirty: bool,

    // ---- compose overlay ----
    pub compose_text: String,

    // ---- sign-in overlay ----
    /// Handle / DID / PDS URL typed into the OAuth sign-in prompt.
    pub signin_input: String,
    /// Set by the modal to request the run loop start OAuth (with this input);
    /// the loop suspends the TUI, runs it inline, then restores.
    pub pending_oauth: Option<String>,

    // ---- add-station overlay ----
    pub add_form: AddStationForm,

    // ---- comments / notifications ----
    pub comments: Vec<CommentView>,
    pub comments_selected: usize,
    pub notifications: Vec<NotificationView>,
    pub unread: u32,

    // ---- player (mirrored from the engine for rendering) ----
    pub current: Option<StationInfo>,
    pub volume: f32,
    pub muted: bool,

    // ---- atradio Connect (remote control) ----
    /// Handle for sending commands to other devices (None when logged out).
    pub remote_control: Option<crate::remote::RemoteControl>,
    /// Account roster (this device + peers), newest snapshot from the hub.
    pub remote_devices: Vec<crate::remote::Device>,
    /// The device we're currently controlling; None = play on this device.
    pub remote_target: Option<String>,
    /// This device's id, once the hub acknowledges it.
    pub self_device_id: Option<String>,
    /// Whether the Connect socket is currently online.
    pub connect_online: bool,
    /// Selection index within the device-picker overlay.
    pub device_sel: usize,

    // ---- gRPC remote control ----
    /// When set, this TUI is driving another atradio over its gRPC control API:
    /// transport/load/DSP/favorite go to the remote, and now-playing/volume/DSP
    /// are rendered from its mirror. Navigation/search stay local.
    pub grpc_remote: Option<crate::grpc::client::GrpcRemote>,

    // ---- DSP ----
    pub dsp: AudioSettings,
    pub dsp_row: usize,

    // ---- identity ----
    pub logged_in: bool,
    pub handle: Option<String>,
    /// Optional display name of the connected user.
    pub display_name: Option<String>,
    pub did: Option<String>,
    /// Sign-in method: "password" | "oauth".
    pub method: Option<String>,
    pub pds: Option<String>,
    /// App-password credentials from the environment, for in-TUI sign-in.
    pub env_creds: Option<(String, String)>,

    pub toast: Toast,
    matcher: SkimMatcherV2,
}

impl App {
    pub fn new(logged_in: bool, handle: Option<String>) -> Self {
        Self {
            view: View::Home,
            overlay: Overlay::None,
            should_quit: false,
            home_tab: HomeTab::Popular,
            trending: Vec::new(),
            popular: Vec::new(),
            favorites: Vec::new(),
            stations: Vec::new(),
            recent: Vec::new(),
            recent_actors: Vec::new(),
            profile_recent: Vec::new(),
            profile_recent_selected: 0,
            selected: 0,
            search_query: String::new(),
            search_results: Vec::new(),
            search_selected: 0,
            search_dirty: false,
            compose_text: String::new(),
            signin_input: String::new(),
            pending_oauth: None,
            add_form: AddStationForm::default(),
            comments: Vec::new(),
            comments_selected: 0,
            notifications: Vec::new(),
            unread: 0,
            current: None,
            volume: 0.8,
            muted: false,
            remote_control: None,
            remote_devices: Vec::new(),
            remote_target: None,
            self_device_id: None,
            connect_online: false,
            device_sel: 0,
            grpc_remote: None,
            dsp: AudioSettings::default(),
            dsp_row: 0,
            logged_in,
            handle,
            display_name: None,
            did: None,
            method: None,
            pds: None,
            env_creds: None,
            toast: Toast::default(),
            matcher: SkimMatcherV2::default(),
        }
    }

    /// The device we're controlling, if it's still present in the roster.
    pub fn remote_target_device(&self) -> Option<&crate::remote::Device> {
        let id = self.remote_target.as_ref()?;
        self.remote_devices
            .iter()
            .find(|d| &d.id == id && !d.is_self)
    }

    /// True when transport actions should be routed to a remote device.
    pub fn remote_active(&self) -> bool {
        self.remote_target_device().is_some()
    }

    /// Peers (devices other than this one) — the remote targets in the picker.
    pub fn other_devices(&self) -> Vec<&crate::remote::Device> {
        self.remote_devices.iter().filter(|d| !d.is_self).collect()
    }

    /// The station list backing the active home tab.
    pub fn active_list(&self) -> &[StationInfo] {
        match self.home_tab {
            HomeTab::Trending => &self.trending,
            HomeTab::Popular => &self.popular,
            HomeTab::Recent => &self.recent,
            HomeTab::Favorites => &self.favorites,
            HomeTab::Yours => &self.stations,
        }
    }

    pub fn selected_station(&self) -> Option<&StationInfo> {
        self.active_list().get(self.selected)
    }

    /// Re-rank cached search results against the current query (fzf-style).
    /// Returns ranked references for rendering.
    pub fn ranked_search(&self) -> Vec<(i64, &StationInfo)> {
        if self.search_query.is_empty() {
            return self.search_results.iter().map(|s| (0i64, s)).collect();
        }
        let mut scored: Vec<(i64, &StationInfo)> = self
            .search_results
            .iter()
            .filter_map(|s| {
                self.matcher
                    .fuzzy_match(&s.name, &self.search_query)
                    .map(|score| (score, s))
            })
            .collect();
        scored.sort_by_key(|(score, _)| std::cmp::Reverse(*score));
        scored
    }

    pub fn clamp_selection(&mut self) {
        let len = self.active_list().len();
        if len == 0 {
            self.selected = 0;
        } else if self.selected >= len {
            self.selected = len - 1;
        }
    }

    pub fn volume_pct(&self) -> u16 {
        (self.volume * 100.0).round() as u16
    }
}
