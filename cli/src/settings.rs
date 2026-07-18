//! Persistent, TOML-backed user settings (volume + the full DSP chain), stored
//! next to the session at `~/.config/atradio/settings.toml`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::player::dsp::AudioSettings;

/// gRPC control API configuration (`[grpc]` in settings.toml). CLI flags
/// (`--connect`, `--grpc-port`, `--no-grpc`) take precedence over these.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct GrpcSettings {
    /// Serve the control API on a unix socket. On by default — the socket lets
    /// a second `atradio` control this one instead of starting a rival player.
    pub enabled: bool,
    /// Unix socket path; unset = `grpc.sock` next to the session file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub socket: Option<String>,
    /// Also serve the API over TCP/HTTP2 on `host:port`. Off by default.
    pub http: bool,
    /// TCP port, used only when `http = true`.
    pub port: u16,
    /// TCP bind address, used only when `http = true`.
    pub host: String,
    /// Bearer token required on the TCP endpoint; auto-generated and written
    /// back here on first use. The unix socket never requires it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

impl Default for GrpcSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            socket: None,
            http: false,
            port: 7799,
            host: "127.0.0.1".to_string(),
            token: None,
        }
    }
}

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

    /// gRPC control API (`[grpc]` section).
    #[serde(default)]
    pub grpc: GrpcSettings,

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
            grpc: GrpcSettings::default(),
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

    /// The gRPC control socket path: the configured `[grpc] socket`, else
    /// `grpc.sock` next to the session file (mirrors how `settings.toml` and
    /// the device id are derived).
    pub fn grpc_socket_path(&self, session_path: &Path) -> PathBuf {
        match &self.grpc.socket {
            Some(p) => PathBuf::from(p),
            None => session_path.with_file_name("grpc.sock"),
        }
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

pub(crate) fn crossfeed_to_str(m: CrossfeedMode) -> &'static str {
    match m {
        CrossfeedMode::Off => "off",
        CrossfeedMode::Meier => "meier",
        CrossfeedMode::Custom => "custom",
    }
}

pub(crate) fn str_to_crossfeed(s: &str) -> CrossfeedMode {
    match s {
        "meier" => CrossfeedMode::Meier,
        "custom" => CrossfeedMode::Custom,
        _ => CrossfeedMode::Off,
    }
}

pub(crate) fn channel_to_str(m: ChannelMode) -> &'static str {
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

pub(crate) fn str_to_channel(s: &str) -> ChannelMode {
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

// ---- fm.atradio.audio.settings record <-> runtime DSP -----------------------
//
// The synced PDS record uses the same shape as the web app (integer gains,
// `crossfeedDirect` in tenths of dB). Now that the CLI's EQ bands match the web
// build (32 Hz…16 kHz), the record is index-aligned with our `eq_gains`, so we
// can sync it. These mirror `packages/lexicons/src/mappers.ts`.

use jacquard::types::string::Datetime;

use crate::fm_atradio::audio::settings::{
    Settings as AudioRecord, SettingsChannelMode, SettingsCrossfeedMode,
};

fn crossfeed_to_record(m: CrossfeedMode) -> SettingsCrossfeedMode {
    match m {
        CrossfeedMode::Off => SettingsCrossfeedMode::Off,
        CrossfeedMode::Meier => SettingsCrossfeedMode::Meier,
        CrossfeedMode::Custom => SettingsCrossfeedMode::Custom,
    }
}

fn channel_to_record(m: ChannelMode) -> SettingsChannelMode {
    match m {
        ChannelMode::Stereo => SettingsChannelMode::Stereo,
        ChannelMode::Mono => SettingsChannelMode::Mono,
        ChannelMode::Custom => SettingsChannelMode::Custom,
        ChannelMode::MonoLeft => SettingsChannelMode::MonoLeft,
        ChannelMode::MonoRight => SettingsChannelMode::MonoRight,
        ChannelMode::Karaoke => SettingsChannelMode::Karaoke,
        ChannelMode::Swap => SettingsChannelMode::Swap,
    }
}

/// Map a synced `fm.atradio.audio.settings` record into runtime DSP state,
/// filling anything the record omits with defaults. `crossfeedDirect` comes in
/// tenths of dB; gains are per-band integers indexed like [`crate::player::dsp::EQ_FREQS`].
pub fn audio_from_record(r: &AudioRecord) -> AudioSettings {
    let mut a = AudioSettings::default();
    if let Some(v) = r.eq_enabled {
        a.eq_enabled = v;
    }
    if let Some(gains) = r.eq_gains.as_ref() {
        for (slot, g) in a.eq_gains.iter_mut().zip(gains.iter()) {
            *slot = *g as f32;
        }
    }
    if let Some(v) = r.bass {
        a.bass = v as i32;
    }
    if let Some(v) = r.treble {
        a.treble = v as i32;
    }
    if let Some(m) = r.crossfeed_mode.as_ref() {
        a.crossfeed_mode = str_to_crossfeed(m.as_str());
    }
    if let Some(v) = r.crossfeed_direct {
        a.crossfeed_direct = v as f32 / 10.0;
    }
    if let Some(v) = r.pbe {
        a.pbe = v as i32;
    }
    if let Some(v) = r.pbe_precut {
        a.pbe_precut = v as i32;
    }
    if let Some(v) = r.surround_delay {
        a.surround_delay = v as i32;
    }
    if let Some(v) = r.surround_balance {
        a.surround_balance = v as i32;
    }
    if let Some(v) = r.comp_threshold {
        a.comp_threshold = v as i32;
    }
    if let Some(v) = r.comp_ratio {
        a.comp_ratio = v as i32;
    }
    if let Some(m) = r.channel_mode.as_ref() {
        a.channel_mode = str_to_channel(m.as_str());
    }
    if let Some(v) = r.stereo_width {
        a.stereo_width = v as i32;
    }
    a
}

/// Build the singleton settings record from runtime DSP state. Inverse of
/// [`audio_from_record`]: `crossfeedDirect` goes dB → tenths of dB and every
/// gain is rounded to the integer the lexicon requires.
pub fn audio_to_record(a: &AudioSettings) -> AudioRecord {
    AudioRecord::new()
        .updated_at(Datetime::now())
        .eq_enabled(a.eq_enabled)
        .eq_gains(
            a.eq_gains
                .iter()
                .map(|g| g.round() as i64)
                .collect::<Vec<_>>(),
        )
        .bass(a.bass as i64)
        .treble(a.treble as i64)
        .crossfeed_mode(crossfeed_to_record(a.crossfeed_mode))
        .crossfeed_direct((a.crossfeed_direct * 10.0).round() as i64)
        .pbe(a.pbe as i64)
        .pbe_precut(a.pbe_precut as i64)
        .surround_delay(a.surround_delay as i64)
        .surround_balance(a.surround_balance as i64)
        .comp_threshold(a.comp_threshold as i64)
        .comp_ratio(a.comp_ratio as i64)
        .channel_mode(channel_to_record(a.channel_mode))
        .stereo_width(a.stereo_width as i64)
        .build()
}
