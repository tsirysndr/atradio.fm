//! The equalizer/DSP panel rows: a flat, ordered list of adjustable controls
//! mapping the web app's audio settings onto the Rockbox chain.

use rockbox_playback::EQ_BANDS;

use crate::player::dsp::{
    channel_label, crossfeed_label, AudioSettings, CHANNEL_MODES, CROSSFEED_MODES, EQ_FREQS,
};

/// A single adjustable row.
pub struct Row {
    pub label: String,
    pub value: String,
    /// 0.0..=1.0 fill for a bar, or None for enable/mode toggles.
    pub fill: Option<f32>,
}

/// Build the ordered rows for rendering.
pub fn rows(s: &AudioSettings) -> Vec<Row> {
    let mut v = Vec::with_capacity(14 + EQ_BANDS);

    v.push(Row {
        label: "Equalizer".into(),
        value: if s.eq_enabled { "On" } else { "Off" }.into(),
        fill: None,
    });
    for (i, &hz) in EQ_FREQS.iter().enumerate() {
        v.push(Row {
            label: format!("  {}", freq_label(hz)),
            value: format!("{:+.0} dB", s.eq_gains[i]),
            fill: Some(norm(s.eq_gains[i] as f32, -24.0, 24.0)),
        });
    }
    v.push(Row {
        label: "Bass".into(),
        value: format!("{:+} dB", s.bass),
        fill: Some(norm(s.bass as f32, -24.0, 24.0)),
    });
    v.push(Row {
        label: "Treble".into(),
        value: format!("{:+} dB", s.treble),
        fill: Some(norm(s.treble as f32, -24.0, 24.0)),
    });
    v.push(Row {
        label: "Crossfeed".into(),
        value: crossfeed_label(s.crossfeed_mode).into(),
        fill: None,
    });
    v.push(Row {
        label: "  Direct gain".into(),
        value: format!("{:.1} dB", s.crossfeed_direct),
        fill: Some(norm(s.crossfeed_direct, -6.0, 0.0)),
    });
    v.push(Row {
        label: "Perceptual bass".into(),
        value: format!("{}%", s.pbe),
        fill: Some(norm(s.pbe as f32, 0.0, 100.0)),
    });
    v.push(Row {
        label: "  Pre-cut".into(),
        value: format!("-{} dB", s.pbe_precut),
        fill: Some(norm(s.pbe_precut as f32, 0.0, 24.0)),
    });
    v.push(Row {
        label: "Surround delay".into(),
        value: format!("{} ms", s.surround_delay),
        fill: Some(norm(s.surround_delay as f32, 0.0, 30.0)),
    });
    v.push(Row {
        label: "  Balance".into(),
        value: format!("{}%", s.surround_balance),
        fill: Some(norm(s.surround_balance as f32, 0.0, 100.0)),
    });
    v.push(Row {
        label: "Compressor thr.".into(),
        value: format!("{} dB", s.comp_threshold),
        fill: Some(norm(s.comp_threshold as f32, -30.0, 0.0)),
    });
    v.push(Row {
        label: "  Ratio".into(),
        value: format!("{}:1", s.comp_ratio),
        fill: Some(norm(s.comp_ratio as f32, 2.0, 10.0)),
    });
    v.push(Row {
        label: "Channel mode".into(),
        value: channel_label(s.channel_mode).into(),
        fill: None,
    });
    v.push(Row {
        label: "  Stereo width".into(),
        value: format!("{}%", s.stereo_width),
        fill: Some(norm(s.stereo_width as f32, 0.0, 200.0)),
    });

    v
}

/// Total number of rows (kept in sync with `rows`).
pub fn row_count() -> usize {
    14 + EQ_BANDS
}

/// Adjust the given row by `dir` (+1 / -1). Returns true if changed.
pub fn adjust(s: &mut AudioSettings, row: usize, dir: i32) -> bool {
    let eq_end = 1 + EQ_BANDS;
    match row {
        0 => {
            s.eq_enabled = !s.eq_enabled;
            true
        }
        r if r >= 1 && r < eq_end => {
            let band = r - 1;
            s.eq_gains[band] = (s.eq_gains[band] + dir as f32).clamp(-24.0, 24.0);
            true
        }
        r => adjust_tail(s, r - eq_end, dir),
    }
}

fn adjust_tail(s: &mut AudioSettings, idx: usize, dir: i32) -> bool {
    match idx {
        0 => {
            s.bass = (s.bass + dir).clamp(-24, 24);
        }
        1 => {
            s.treble = (s.treble + dir).clamp(-24, 24);
        }
        2 => {
            cycle_crossfeed(s, dir);
        }
        3 => {
            s.crossfeed_direct = (s.crossfeed_direct + dir as f32 * 0.5).clamp(-6.0, 0.0);
        }
        4 => {
            s.pbe = (s.pbe + dir * 5).clamp(0, 100);
        }
        5 => {
            s.pbe_precut = (s.pbe_precut + dir).clamp(0, 24);
        }
        6 => {
            s.surround_delay = (s.surround_delay + dir).clamp(0, 30);
        }
        7 => {
            s.surround_balance = (s.surround_balance + dir * 5).clamp(0, 100);
        }
        8 => {
            s.comp_threshold = (s.comp_threshold + dir).clamp(-30, 0);
        }
        9 => {
            s.comp_ratio = (s.comp_ratio + dir).clamp(2, 10);
        }
        10 => {
            cycle_channel(s, dir);
        }
        11 => {
            s.stereo_width = (s.stereo_width + dir * 5).clamp(0, 200);
        }
        _ => return false,
    }
    true
}

fn cycle_crossfeed(s: &mut AudioSettings, dir: i32) {
    let cur = CROSSFEED_MODES
        .iter()
        .position(|m| *m == s.crossfeed_mode)
        .unwrap_or(0);
    let n = CROSSFEED_MODES.len();
    let next = ((cur as i32 + dir).rem_euclid(n as i32)) as usize;
    s.crossfeed_mode = CROSSFEED_MODES[next];
}

fn cycle_channel(s: &mut AudioSettings, dir: i32) {
    let cur = CHANNEL_MODES
        .iter()
        .position(|m| *m == s.channel_mode)
        .unwrap_or(0);
    let n = CHANNEL_MODES.len();
    let next = ((cur as i32 + dir).rem_euclid(n as i32)) as usize;
    s.channel_mode = CHANNEL_MODES[next];
}

fn norm(v: f32, lo: f32, hi: f32) -> f32 {
    ((v - lo) / (hi - lo)).clamp(0.0, 1.0)
}

fn freq_label(hz: i32) -> String {
    if hz >= 1000 {
        format!("{}kHz", hz / 1000)
    } else {
        format!("{hz}Hz")
    }
}
