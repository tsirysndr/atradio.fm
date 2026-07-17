//! The Rockbox DSP chain, modelled to match the web app's audio settings
//! (`apps/web/src/atoms/audioSettings.ts` + `fm.atradio.audio.settings`).

use rockbox_playback::{
    BassEnhancement, ChannelMode, Compressor, Crossfeed, CrossfeedMode, EqBand, Equalizer, Player,
    Surround, ToneControls, EQ_BANDS, EQ_BAND_FREQUENCIES,
};

/// Band centre frequencies (Hz), from the engine: 32 … 16 000.
pub const EQ_FREQS: [i32; EQ_BANDS] = EQ_BAND_FREQUENCIES;

/// The full user-facing DSP state. Defaults mirror `DEFAULT_AUDIO_SETTINGS`.
#[derive(Clone, Debug)]
pub struct AudioSettings {
    pub eq_enabled: bool,
    /// Per-band gain in dB (−24 … 24), one per [`EQ_BANDS`].
    pub eq_gains: [f32; EQ_BANDS],
    pub bass: i32,   // dB
    pub treble: i32, // dB
    pub crossfeed_mode: CrossfeedMode,
    pub crossfeed_direct: f32, // dB (≤ 0)
    pub pbe: i32,              // 0 … 100 %
    pub pbe_precut: i32,       // dB cut (≥ 0)
    pub surround_delay: i32,   // ms (0 = off)
    pub surround_balance: i32, // %
    pub comp_threshold: i32,   // dB (0 = off)
    pub comp_ratio: i32,       // 2 … 10
    pub channel_mode: ChannelMode,
    pub stereo_width: i32, // %
}

impl Default for AudioSettings {
    fn default() -> Self {
        Self {
            eq_enabled: false,
            eq_gains: [0.0; EQ_BANDS],
            bass: 0,
            treble: 0,
            crossfeed_mode: CrossfeedMode::Off,
            crossfeed_direct: -1.5,
            pbe: 0,
            pbe_precut: 0,
            surround_delay: 0,
            surround_balance: 35,
            comp_threshold: 0,
            comp_ratio: 2,
            channel_mode: ChannelMode::Stereo,
            stereo_width: 100,
        }
    }
}

impl AudioSettings {
    /// Push the whole chain to the engine. Safe to call live.
    pub fn apply(&self, p: &Player) {
        // Equalizer.
        p.set_eq_enabled(self.eq_enabled);
        for (i, &gain) in self.eq_gains.iter().enumerate() {
            p.set_eq_band(
                i,
                EqBand {
                    cutoff_hz: EQ_FREQS[i],
                    q: 1.0,
                    gain_db: gain,
                },
            );
        }
        // Tone.
        p.set_tone(ToneControls {
            bass_db: self.bass,
            treble_db: self.treble,
            bass_cutoff_hz: 0,
            treble_cutoff_hz: 0,
        });
        // Crossfeed (direct gain is in tenths of a dB).
        p.set_crossfeed(Crossfeed {
            mode: self.crossfeed_mode,
            direct_gain: (self.crossfeed_direct * 10.0).round() as i32,
            ..Default::default()
        });
        // Perceptual bass enhancement (precut is tenths of a dB, ≤ 0).
        p.set_bass_enhancement(BassEnhancement {
            strength: self.pbe,
            precut: -(self.pbe_precut * 10),
        });
        // Haas surround.
        p.set_surround(Surround {
            delay_ms: self.surround_delay,
            balance: self.surround_balance,
            cutoff_low_hz: 0,
            cutoff_high_hz: 0,
        });
        // Compressor.
        p.set_compressor(Compressor {
            threshold_db: self.comp_threshold,
            makeup_gain: 1,
            ratio: ratio_index(self.comp_ratio),
            knee: 2,
            attack_ms: 5,
            release_ms: 200,
        });
        // Channel / stereo width.
        p.set_channel_mode(self.channel_mode);
        p.set_stereo_width(self.stereo_width);
    }

    /// Build the full [`Equalizer`] value (for one-shot pushes).
    pub fn equalizer(&self) -> Equalizer {
        Equalizer {
            enabled: self.eq_enabled,
            precut_db: 0.0,
            bands: self
                .eq_gains
                .iter()
                .enumerate()
                .map(|(i, &g)| EqBand {
                    cutoff_hz: EQ_FREQS[i],
                    q: 1.0,
                    gain_db: g,
                })
                .collect(),
        }
    }
}

/// Map a plain N:1 ratio to the engine's ratio index.
fn ratio_index(ratio: i32) -> i32 {
    match ratio {
        r if r <= 2 => 0, // 2:1
        r if r <= 4 => 1, // 4:1
        r if r <= 6 => 2, // 6:1
        _ => 3,           // 10:1
    }
}

/// The DSP "rows" shown in the equalizer/settings panel, in order.
pub const CROSSFEED_MODES: [CrossfeedMode; 3] = [
    CrossfeedMode::Off,
    CrossfeedMode::Meier,
    CrossfeedMode::Custom,
];

pub const CHANNEL_MODES: [ChannelMode; 7] = [
    ChannelMode::Stereo,
    ChannelMode::Mono,
    ChannelMode::Custom,
    ChannelMode::MonoLeft,
    ChannelMode::MonoRight,
    ChannelMode::Karaoke,
    ChannelMode::Swap,
];

pub fn crossfeed_label(m: CrossfeedMode) -> &'static str {
    match m {
        CrossfeedMode::Off => "Off",
        CrossfeedMode::Meier => "Meier",
        CrossfeedMode::Custom => "Custom",
    }
}

pub fn channel_label(m: ChannelMode) -> &'static str {
    match m {
        ChannelMode::Stereo => "Stereo",
        ChannelMode::Mono => "Mono",
        ChannelMode::Custom => "Custom",
        ChannelMode::MonoLeft => "Mono L",
        ChannelMode::MonoRight => "Mono R",
        ChannelMode::Karaoke => "Karaoke",
        ChannelMode::Swap => "Swap",
    }
}
