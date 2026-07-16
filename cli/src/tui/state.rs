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
}

/// Home has several horizontally-laid lists; this tracks focus.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum HomeTab {
    Trending,
    Popular,
    Favorites,
}

impl HomeTab {
    pub fn all() -> [HomeTab; 3] {
        [HomeTab::Trending, HomeTab::Popular, HomeTab::Favorites]
    }
    pub fn label(self) -> &'static str {
        match self {
            HomeTab::Trending => "Trending",
            HomeTab::Popular => "Popular",
            HomeTab::Favorites => "Favorites",
        }
    }
    pub fn next(self) -> HomeTab {
        match self {
            HomeTab::Trending => HomeTab::Popular,
            HomeTab::Popular => HomeTab::Favorites,
            HomeTab::Favorites => HomeTab::Trending,
        }
    }
    pub fn prev(self) -> HomeTab {
        match self {
            HomeTab::Trending => HomeTab::Favorites,
            HomeTab::Popular => HomeTab::Trending,
            HomeTab::Favorites => HomeTab::Popular,
        }
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
    pub selected: usize,

    // ---- search overlay ----
    pub search_query: String,
    pub search_results: Vec<StationInfo>,
    pub search_selected: usize,
    /// Set when the query changed and a fetch should fire.
    pub search_dirty: bool,

    // ---- compose overlay ----
    pub compose_text: String,

    // ---- comments / notifications ----
    pub comments: Vec<CommentView>,
    pub comments_selected: usize,
    pub notifications: Vec<NotificationView>,
    pub unread: u32,

    // ---- player (mirrored from the engine for rendering) ----
    pub current: Option<StationInfo>,
    pub volume: f32,
    pub muted: bool,

    // ---- DSP ----
    pub dsp: AudioSettings,
    pub dsp_row: usize,

    // ---- identity ----
    pub logged_in: bool,
    pub handle: Option<String>,

    pub toast: Toast,
    matcher: SkimMatcherV2,
}

impl App {
    pub fn new(logged_in: bool, handle: Option<String>) -> Self {
        Self {
            view: View::Home,
            overlay: Overlay::None,
            should_quit: false,
            home_tab: HomeTab::Trending,
            trending: Vec::new(),
            popular: Vec::new(),
            favorites: Vec::new(),
            selected: 0,
            search_query: String::new(),
            search_results: Vec::new(),
            search_selected: 0,
            search_dirty: false,
            compose_text: String::new(),
            comments: Vec::new(),
            comments_selected: 0,
            notifications: Vec::new(),
            unread: 0,
            current: None,
            volume: 0.8,
            muted: false,
            dsp: AudioSettings::default(),
            dsp_row: 0,
            logged_in,
            handle,
            toast: Toast::default(),
            matcher: SkimMatcherV2::default(),
        }
    }

    /// The station list backing the active home tab.
    pub fn active_list(&self) -> &[StationInfo] {
        match self.home_tab {
            HomeTab::Trending => &self.trending,
            HomeTab::Popular => &self.popular,
            HomeTab::Favorites => &self.favorites,
        }
    }

    pub fn selected_station(&self) -> Option<&StationInfo> {
        self.active_list().get(self.selected)
    }

    /// Re-rank cached search results against the current query (fzf-style).
    /// Returns ranked references for rendering.
    pub fn ranked_search(&self) -> Vec<(i64, &StationInfo)> {
        if self.search_query.is_empty() {
            return self
                .search_results
                .iter()
                .map(|s| (0i64, s))
                .collect();
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
        scored.sort_by(|a, b| b.0.cmp(&a.0));
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
