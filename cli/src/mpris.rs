//! atradio on the desktop session bus — an **MPRIS** `org.mpris.MediaPlayer2`
//! player (Linux only). Modeled on fin's `fin-mpris` crate.
//!
//! The audio engine handle (`rockbox_playback::Player`) owns a cpal output
//! stream and is deliberately `!Send`/`!Sync`, so it can never be shared with
//! the D-Bus tasks. The interface below therefore holds only Send-safe
//! channels:
//!   - a `watch::Receiver<NowPlaying>` — the owner publishes a snapshot every
//!     UI tick, and every read method answers from the latest one;
//!   - an `mpsc::UnboundedSender<MprisCmd>` — desktop-initiated transport
//!     commands flow back for the owning thread to apply on the engine.
//!
//! A small notify task diffs snapshots into D-Bus `PropertiesChanged`
//! signals, exactly like fin's poll loop (there is no event bus to subscribe
//! to on the engine either).

use mpris_server::zbus::{self, fdo};
use mpris_server::{
    LoopStatus, Metadata, PlaybackRate, PlaybackStatus, PlayerInterface, Property, RootInterface,
    Server, Time, TrackId, Volume,
};
use tokio::sync::{mpsc, watch};

use crate::player::{MprisCmd, NowPlaying, State};

/// The `org.mpris.MediaPlayer2.atradio` implementation handed to zbus.
pub struct Player {
    state: watch::Receiver<NowPlaying>,
    cmd: mpsc::UnboundedSender<MprisCmd>,
}

impl Player {
    fn snap(&self) -> NowPlaying {
        self.state.borrow().clone()
    }

    fn send(&self, cmd: MprisCmd) {
        let _ = self.cmd.send(cmd);
    }
}

fn mpris_status(state: State) -> PlaybackStatus {
    match state {
        State::Playing => PlaybackStatus::Playing,
        State::Paused => PlaybackStatus::Paused,
        State::Stopped => PlaybackStatus::Stopped,
    }
}

/// Station names aren't valid D-Bus path segments — squash anything that
/// isn't ASCII-alphanumeric so the trackid stays a well-formed object path.
fn track_id(np: &NowPlaying) -> TrackId {
    let mut safe: String = np
        .station
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    if safe.is_empty() {
        safe.push('_');
    }
    TrackId::try_from(format!("/fm/atradio/track/{safe}")).unwrap_or(TrackId::NO_TRACK)
}

fn metadata(np: &NowPlaying) -> Metadata {
    let has_anything = np.line().is_some() || !np.station.trim().is_empty();
    if !has_anything {
        // Spec: an empty map with the NoTrack id tells clients to clear.
        return Metadata::builder().trackid(TrackId::NO_TRACK).build();
    }
    let title = if !np.title.trim().is_empty() {
        np.title.clone()
    } else {
        np.line().unwrap_or_else(|| np.station.clone())
    };
    let mut b = Metadata::builder().trackid(track_id(np)).title(title);
    if !np.artist.trim().is_empty() {
        b = b.artist([np.artist.clone()]);
    }
    // ICY convention: the station name doubles as the album for applets.
    if !np.station.trim().is_empty() {
        b = b.album(np.station.clone());
    }
    b.build()
}

impl RootInterface for Player {
    async fn raise(&self) -> fdo::Result<()> {
        // A TUI has no window to raise.
        Ok(())
    }

    async fn quit(&self) -> fdo::Result<()> {
        Ok(())
    }

    async fn can_quit(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn fullscreen(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn set_fullscreen(&self, _fullscreen: bool) -> zbus::Result<()> {
        Ok(())
    }

    async fn can_set_fullscreen(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn can_raise(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn has_track_list(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn identity(&self) -> fdo::Result<String> {
        Ok("atradio".to_string())
    }

    async fn desktop_entry(&self) -> fdo::Result<String> {
        Ok("atradio".to_string())
    }

    async fn supported_uri_schemes(&self) -> fdo::Result<Vec<String>> {
        // Stations come from the TUI, not arbitrary URIs — OpenUri is
        // unsupported.
        Ok(Vec::new())
    }

    async fn supported_mime_types(&self) -> fdo::Result<Vec<String>> {
        Ok(Vec::new())
    }
}

impl PlayerInterface for Player {
    async fn next(&self) -> fdo::Result<()> {
        // Live radio has no queue.
        Ok(())
    }

    async fn previous(&self) -> fdo::Result<()> {
        Ok(())
    }

    async fn pause(&self) -> fdo::Result<()> {
        self.send(MprisCmd::Pause);
        Ok(())
    }

    async fn play_pause(&self) -> fdo::Result<()> {
        self.send(MprisCmd::PlayPause);
        Ok(())
    }

    async fn stop(&self) -> fdo::Result<()> {
        self.send(MprisCmd::Stop);
        Ok(())
    }

    async fn play(&self) -> fdo::Result<()> {
        self.send(MprisCmd::Play);
        Ok(())
    }

    async fn seek(&self, _offset: Time) -> fdo::Result<()> {
        // Live streams aren't seekable.
        Ok(())
    }

    async fn set_position(&self, _track: TrackId, _position: Time) -> fdo::Result<()> {
        Ok(())
    }

    async fn open_uri(&self, _uri: String) -> fdo::Result<()> {
        Err(fdo::Error::NotSupported(
            "atradio plays stations picked in the TUI".to_string(),
        ))
    }

    async fn playback_status(&self) -> fdo::Result<PlaybackStatus> {
        Ok(mpris_status(self.snap().state))
    }

    async fn loop_status(&self) -> fdo::Result<LoopStatus> {
        Ok(LoopStatus::None)
    }

    async fn set_loop_status(&self, _status: LoopStatus) -> zbus::Result<()> {
        Ok(())
    }

    async fn rate(&self) -> fdo::Result<PlaybackRate> {
        Ok(1.0)
    }

    async fn set_rate(&self, _rate: PlaybackRate) -> zbus::Result<()> {
        // Only 1.0 is supported (min == max), so this is allowed to no-op.
        Ok(())
    }

    async fn shuffle(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn set_shuffle(&self, _shuffle: bool) -> zbus::Result<()> {
        Ok(())
    }

    async fn metadata(&self) -> fdo::Result<Metadata> {
        Ok(metadata(&self.snap()))
    }

    async fn volume(&self) -> fdo::Result<Volume> {
        Ok(self.snap().volume as f64)
    }

    async fn set_volume(&self, volume: Volume) -> zbus::Result<()> {
        self.send(MprisCmd::SetVolume(volume.clamp(0.0, 1.0) as f32));
        Ok(())
    }

    async fn position(&self) -> fdo::Result<Time> {
        Ok(Time::from_micros(self.snap().position.as_micros() as i64))
    }

    async fn minimum_rate(&self) -> fdo::Result<PlaybackRate> {
        Ok(1.0)
    }

    async fn maximum_rate(&self) -> fdo::Result<PlaybackRate> {
        Ok(1.0)
    }

    async fn can_go_next(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn can_go_previous(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn can_play(&self) -> fdo::Result<bool> {
        Ok(true)
    }

    async fn can_pause(&self) -> fdo::Result<bool> {
        Ok(true)
    }

    async fn can_seek(&self) -> fdo::Result<bool> {
        Ok(false)
    }

    async fn can_control(&self) -> fdo::Result<bool> {
        Ok(true)
    }
}

/// Everything the notify task diffs between snapshots.
#[derive(PartialEq)]
struct Snap {
    status: PlaybackStatus,
    line: String,
    station: String,
    volume_milli: i32,
}

impl Snap {
    fn of(np: &NowPlaying) -> Self {
        Self {
            status: mpris_status(np.state),
            line: np.line().unwrap_or_default(),
            station: np.station.clone(),
            volume_milli: (np.volume * 1000.0).round() as i32,
        }
    }
}

/// Register `org.mpris.MediaPlayer2.atradio` on the session bus and start the
/// notify task. Returns the receiver for desktop-initiated transport
/// commands; feed snapshots through the sender half of `state`. Best-effort:
/// with no session bus the task just exits (silently — the TUI owns the
/// terminal).
pub fn spawn(state: watch::Receiver<NowPlaying>) -> mpsc::UnboundedReceiver<MprisCmd> {
    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
    let notify_rx = state.clone();
    tokio::spawn(async move {
        let server = match Server::new(
            "atradio",
            Player {
                state: state.clone(),
                cmd: cmd_tx.clone(),
            },
        )
        .await
        {
            Ok(s) => s,
            // Name taken (another atradio instance) — retry with a pid
            // suffix per the MPRIS spec; if that fails too (e.g. no session
            // bus at all), desktop integration is simply off.
            Err(_) => {
                match Server::new(
                    &format!("atradio.instance{}", std::process::id()),
                    Player {
                        state,
                        cmd: cmd_tx,
                    },
                )
                .await
                {
                    Ok(s) => s,
                    Err(_) => return,
                }
            }
        };
        notify_loop(server, notify_rx).await;
    });
    cmd_rx
}

async fn notify_loop(server: Server<Player>, mut rx: watch::Receiver<NowPlaying>) {
    let mut last = Snap::of(&rx.borrow().clone());
    loop {
        // The owner publishes every UI tick; bail out when it's gone.
        if rx.changed().await.is_err() {
            return;
        }
        let np = rx.borrow_and_update().clone();
        let snap = Snap::of(&np);
        if snap == last {
            continue;
        }

        let mut props = Vec::new();
        if snap.status != last.status {
            props.push(Property::PlaybackStatus(snap.status));
        }
        if snap.line != last.line || snap.station != last.station {
            props.push(Property::Metadata(metadata(&np)));
        }
        if snap.volume_milli != last.volume_milli {
            props.push(Property::Volume(np.volume as f64));
        }
        if !props.is_empty() {
            let _ = server.properties_changed(props).await;
        }
        last = snap;
    }
}
