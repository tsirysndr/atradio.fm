//! atproto integration, now delegated to [`atradio_sdk::AtradioAgent`].
//!
//! `Atproto` is a thin newtype over the SDK agent: it [`Deref`]s to the agent so
//! every auth/write verb (`login_*`, `favorite`, `comment`, `set_play_status`,
//! `mint_service_auth`, …) passes straight through. It adds only the
//! audio-settings DSP⇄record mapping, which stays in the CLI because it depends
//! on the player's rockbox DSP types — not an SDK concern.

use std::ops::Deref;
use std::path::PathBuf;

use anyhow::Result;

pub use atradio_sdk::{Profile, StationDraft};

use atradio_sdk::AtradioAgent;

use crate::player::dsp::AudioSettings;
use crate::settings::{audio_from_record, audio_to_record};

/// The CLI's atproto handle: the SDK agent plus DSP-aware audio-settings sync.
#[derive(Clone)]
pub struct Atproto(AtradioAgent);

impl Atproto {
    pub fn new(session_path: PathBuf) -> Self {
        Self(AtradioAgent::new(session_path))
    }

    /// Fetch the synced audio-settings singleton, decoded into runtime DSP
    /// state. Returns `None` when the account has no record yet (first run).
    pub async fn get_audio_settings(&self) -> Result<Option<AudioSettings>> {
        Ok(self
            .0
            .get_audio_settings()
            .await?
            .map(|record| audio_from_record(&record)))
    }

    /// Upsert the audio-settings singleton from runtime DSP state, so the EQ +
    /// DSP chain follows the account to the web app and other devices.
    pub async fn put_audio_settings(&self, dsp: &AudioSettings) -> Result<()> {
        self.0.put_audio_settings(audio_to_record(dsp)).await?;
        Ok(())
    }
}

impl Deref for Atproto {
    type Target = AtradioAgent;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
