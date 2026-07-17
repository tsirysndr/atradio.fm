//! Persistent, TOML-backed user settings (volume + the full DSP chain), stored
//! next to the session at `~/.config/atradio/settings.toml`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::player::dsp::AudioSettings;

/// Serializable mirror of [`AudioSettings`] plus player prefs. Enums are stored
/// as lowercase strings to keep the file human-editable.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub volume: f32,

    /// atradio Connect device name shown to other clients. Editable in
    /// `settings.toml`; falls back to a hostname-based default when empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,

    pub eq_enabled: bool,
    pub eq_gains: Vec<f32>,
    pub bass: i32,
    pub treble: i32,
    pub crossfeed_mode: String,
    pub crossfeed_direct: f32,
    pub pbe: i32,
    pub pbe_precut: i32,
    pub surround_delay: i32,
    pub surround_balance: i32,
    pub comp_threshold: i32,
    pub comp_ratio: i32,
    pub channel_mode: String,
    pub stereo_width: i32,
}

impl Default for Settings {
    fn default() -> Self {
        let d = AudioSettings::default();
        Self {
            volume: 0.8,
            device_name: None,
            eq_enabled: d.eq_enabled,
            eq_gains: d.eq_gains.to_vec(),
            bass: d.bass,
            treble: d.treble,
            crossfeed_mode: crossfeed_to_str(d.crossfeed_mode).into(),
            crossfeed_direct: d.crossfeed_direct,
            pbe: d.pbe,
            pbe_precut: d.pbe_precut,
            surround_delay: d.surround_delay,
            surround_balance: d.surround_balance,
            comp_threshold: d.comp_threshold,
            comp_ratio: d.comp_ratio,
            channel_mode: channel_to_str(d.channel_mode).into(),
            stereo_width: d.stereo_width,
        }
    }
}

impl Settings {
    fn path(session_path: &Path) -> PathBuf {
        session_path.with_file_name("settings.toml")
    }

    pub fn load(session_path: &Path) -> Self {
        std::fs::read_to_string(Self::path(session_path))
            .ok()
            .and_then(|s| toml::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, session_path: &Path) {
        let path = Self::path(session_path);
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(s) = toml::to_string_pretty(self) {
            let _ = std::fs::write(path, s);
        }
    }

    /// Build the runtime [`AudioSettings`] from the persisted values.
    pub fn audio(&self) -> AudioSettings {
        let mut a = AudioSettings::default();
        a.eq_enabled = self.eq_enabled;
        for (i, slot) in a.eq_gains.iter_mut().enumerate() {
            if let Some(g) = self.eq_gains.get(i) {
                *slot = *g;
            }
        }
        a.bass = self.bass;
        a.treble = self.treble;
        a.crossfeed_mode = str_to_crossfeed(&self.crossfeed_mode);
        a.crossfeed_direct = self.crossfeed_direct;
        a.pbe = self.pbe;
        a.pbe_precut = self.pbe_precut;
        a.surround_delay = self.surround_delay;
        a.surround_balance = self.surround_balance;
        a.comp_threshold = self.comp_threshold;
        a.comp_ratio = self.comp_ratio;
        a.channel_mode = str_to_channel(&self.channel_mode);
        a.stereo_width = self.stereo_width;
        a
    }

    /// Capture the current runtime DSP + volume back into the persisted shape.
    pub fn update_from(&mut self, audio: &AudioSettings, volume: f32) {
        self.volume = volume;
        self.eq_enabled = audio.eq_enabled;
        self.eq_gains = audio.eq_gains.to_vec();
        self.bass = audio.bass;
        self.treble = audio.treble;
        self.crossfeed_mode = crossfeed_to_str(audio.crossfeed_mode).into();
        self.crossfeed_direct = audio.crossfeed_direct;
        self.pbe = audio.pbe;
        self.pbe_precut = audio.pbe_precut;
        self.surround_delay = audio.surround_delay;
        self.surround_balance = audio.surround_balance;
        self.comp_threshold = audio.comp_threshold;
        self.comp_ratio = audio.comp_ratio;
        self.channel_mode = channel_to_str(audio.channel_mode).into();
        self.stereo_width = audio.stereo_width;
    }
}

use rockbox_playback::{ChannelMode, CrossfeedMode};

fn crossfeed_to_str(m: CrossfeedMode) -> &'static str {
    match m {
        CrossfeedMode::Off => "off",
        CrossfeedMode::Meier => "meier",
        CrossfeedMode::Custom => "custom",
    }
}

fn str_to_crossfeed(s: &str) -> CrossfeedMode {
    match s {
        "meier" => CrossfeedMode::Meier,
        "custom" => CrossfeedMode::Custom,
        _ => CrossfeedMode::Off,
    }
}

fn channel_to_str(m: ChannelMode) -> &'static str {
    match m {
        ChannelMode::Stereo => "stereo",
        ChannelMode::Mono => "mono",
        ChannelMode::Custom => "custom",
        ChannelMode::MonoLeft => "mono-left",
        ChannelMode::MonoRight => "mono-right",
        ChannelMode::Karaoke => "karaoke",
        ChannelMode::Swap => "swap",
    }
}

fn str_to_channel(s: &str) -> ChannelMode {
    match s {
        "mono" => ChannelMode::Mono,
        "custom" => ChannelMode::Custom,
        "mono-left" => ChannelMode::MonoLeft,
        "mono-right" => ChannelMode::MonoRight,
        "karaoke" => ChannelMode::Karaoke,
        "swap" => ChannelMode::Swap,
        _ => ChannelMode::Stereo,
    }
}
