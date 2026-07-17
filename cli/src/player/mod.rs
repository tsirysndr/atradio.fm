//! Thin wrapper around the Rockbox playback engine. One instance per process.
#![allow(dead_code)] // full transport surface exposed; not all keys are bound yet

pub mod dsp;

use std::sync::Mutex;
use std::time::Duration;

use anyhow::Result;
use rockbox_playback::{PlaybackState, Player as RbPlayer};

pub use dsp::AudioSettings;

pub struct Player {
    rb: RbPlayer,
    /// Last non-zero volume, so mute/unmute can restore it.
    last_volume: Mutex<f32>,
}

/// A flattened snapshot for the UI, derived from the engine's `Status`.
#[derive(Clone, Debug, Default)]
pub struct NowPlaying {
    pub state: State,
    pub position: Duration,
    /// ICY `StreamTitle` current-song title.
    pub title: String,
    pub artist: String,
    /// ICY `icy-name` — the station name.
    pub station: String,
    pub bitrate: u32,
    pub sample_rate: u32,
    /// Decoded codec, e.g. "mp3", "aac".
    pub codec: String,
    /// Current volume (0.0..=1.0) — carried so consumers of snapshots
    /// (e.g. the MPRIS thread) never need the non-Send engine handle.
    pub volume: f32,
}

impl NowPlaying {
    /// A compact "format" line, e.g. "MP3 · 128 kbps · 44.1 kHz". Empty when
    /// nothing is decoding yet.
    pub fn format_line(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        if !self.codec.trim().is_empty() {
            parts.push(self.codec.to_uppercase());
        }
        if self.bitrate > 0 {
            parts.push(format!("{} kbps", self.bitrate));
        }
        if self.sample_rate > 0 {
            parts.push(format!("{:.1} kHz", self.sample_rate as f32 / 1000.0));
        }
        parts.join(" · ")
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum State {
    #[default]
    Stopped,
    Playing,
    Paused,
}

/// Transport commands from desktop integration (MPRIS on Linux), routed back
/// to the thread that owns the [`Player`] — the engine handle holds a cpal
/// output stream and is `!Send`, so it can never cross to the D-Bus thread.
#[derive(Clone, Copy, Debug)]
pub enum MprisCmd {
    PlayPause,
    Play,
    Pause,
    Stop,
    SetVolume(f32),
}

impl NowPlaying {
    /// A single "now playing" line, best-effort from ICY metadata.
    pub fn line(&self) -> Option<String> {
        match (self.artist.trim(), self.title.trim()) {
            ("", "") => None,
            ("", t) => Some(t.to_string()),
            (a, "") => Some(a.to_string()),
            (a, t) => Some(format!("{a} — {t}")),
        }
    }
}

impl Player {
    pub fn new() -> Result<Self> {
        let rb = RbPlayer::new().map_err(|e| anyhow::anyhow!("audio engine: {e}"))?;
        rb.set_volume(0.8);
        Ok(Self {
            rb,
            last_volume: Mutex::new(0.8),
        })
    }

    /// Borrow the raw engine (for direct DSP setters).
    pub fn engine(&self) -> &RbPlayer {
        &self.rb
    }

    /// Start (or restart) playback of a single stream URL.
    pub fn play_url(&self, url: &str) {
        self.rb.set_queue([url.to_string()]);
        self.rb.play();
    }

    pub fn toggle(&self) {
        self.rb.toggle();
    }

    pub fn play(&self) {
        self.rb.play();
    }

    pub fn pause(&self) {
        self.rb.pause();
    }

    pub fn stop(&self) {
        self.rb.stop();
    }

    pub fn set_volume(&self, vol: f32) {
        let v = vol.clamp(0.0, 1.0);
        if v > 0.0 {
            *self.last_volume.lock().unwrap() = v;
        }
        self.rb.set_volume(v);
    }

    pub fn volume(&self) -> f32 {
        self.rb.volume()
    }

    pub fn is_muted(&self) -> bool {
        self.rb.volume() <= 0.0
    }

    pub fn toggle_mute(&self) {
        if self.is_muted() {
            let restore = *self.last_volume.lock().unwrap();
            self.rb
                .set_volume(if restore > 0.0 { restore } else { 0.8 });
        } else {
            *self.last_volume.lock().unwrap() = self.rb.volume();
            self.rb.set_volume(0.0);
        }
    }

    /// Nudge the volume by a delta (for +/- keys).
    pub fn bump_volume(&self, delta: f32) {
        self.set_volume(self.rb.volume() + delta);
    }

    pub fn apply_dsp(&self, settings: &AudioSettings) {
        settings.apply(&self.rb);
    }

    pub fn now_playing(&self) -> NowPlaying {
        let st = self.rb.status();
        let state = match st.state {
            PlaybackState::Playing => State::Playing,
            PlaybackState::Paused => State::Paused,
            PlaybackState::Stopped => State::Stopped,
        };
        let (title, artist, station, bitrate, sample_rate, codec) = match st.metadata.as_ref() {
            Some(m) => (
                m.title.clone(),
                m.artist.clone(),
                m.album.clone(),
                m.bitrate,
                m.sample_rate,
                m.codec.clone(),
            ),
            None => (
                String::new(),
                String::new(),
                String::new(),
                0,
                0,
                String::new(),
            ),
        };
        NowPlaying {
            state,
            position: st.position,
            title,
            artist,
            station,
            bitrate,
            sample_rate,
            codec,
            volume: self.rb.volume(),
        }
    }
}
