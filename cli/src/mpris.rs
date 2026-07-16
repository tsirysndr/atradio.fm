//! MPRIS (org.mpris.MediaPlayer2) D-Bus integration — Linux only.
//!
//! Exposes the running player to the desktop so media keys, GNOME/KDE panels,
//! `playerctl`, etc. can see "now playing" and drive play/pause/stop/volume.
//!
//! The `mpris_server::Player` is single-threaded (`!Send`), so it runs on its
//! own OS thread with a current-thread Tokio runtime + `LocalSet`. It shares
//! the audio engine through an `Arc<crate::player::Player>` (which is
//! `Send + Sync`), polling it once a second to publish metadata + status.

use std::sync::Arc;
use std::time::Duration;

use mpris_server::{Metadata, PlaybackStatus, Player as MprisPlayer, Time};

use crate::player::{Player, State};

/// Start the MPRIS server in the background. Best-effort: any failure (e.g. no
/// session bus) is logged to stderr and otherwise ignored.
pub fn spawn(player: Arc<Player>) {
    std::thread::Builder::new()
        .name("atradio-mpris".into())
        .spawn(move || {
            let rt = match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    eprintln!("mpris: runtime: {e}");
                    return;
                }
            };
            let local = tokio::task::LocalSet::new();
            local.block_on(&rt, serve(player));
        })
        .ok();
}

async fn serve(player: Arc<Player>) {
    let mpris = match MprisPlayer::builder("fm.atradio")
        .identity("atradio.fm")
        .can_play(true)
        .can_pause(true)
        .can_control(true)
        .can_go_next(false)
        .can_go_previous(false)
        .can_seek(false)
        .build()
        .await
    {
        Ok(p) => p,
        Err(e) => {
            eprintln!("mpris: no session bus ({e}); desktop integration off");
            return;
        }
    };

    // Wire desktop controls back to the engine.
    let p = player.clone();
    mpris.connect_play_pause(move |_| p.toggle());
    let p = player.clone();
    mpris.connect_play(move |_| p.play());
    let p = player.clone();
    mpris.connect_pause(move |_| p.toggle());
    let p = player.clone();
    mpris.connect_stop(move |_| p.stop());
    let p = player.clone();
    mpris.connect_set_volume(move |_, v| p.set_volume(v as f32));

    tokio::task::spawn_local(mpris.run());

    // Publish state + metadata on change.
    let mut last_state: Option<State> = None;
    let mut last_line = String::new();
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let np = player.now_playing();

        if last_state != Some(np.state) {
            let status = match np.state {
                State::Playing => PlaybackStatus::Playing,
                State::Paused => PlaybackStatus::Paused,
                State::Stopped => PlaybackStatus::Stopped,
            };
            let _ = mpris.set_playback_status(status).await;
            last_state = Some(np.state);
        }

        let line = np.line().unwrap_or_default();
        if line != last_line {
            let mut b = Metadata::builder();
            if !np.title.trim().is_empty() {
                b = b.title(np.title.clone());
            } else if !line.is_empty() {
                b = b.title(line.clone());
            }
            if !np.artist.trim().is_empty() {
                b = b.artist([np.artist.clone()]);
            }
            if !np.station.trim().is_empty() {
                b = b.album(np.station.clone());
            }
            b = b.length(Time::from_secs(0)); // live stream: unknown length
            let _ = mpris.set_metadata(b.build()).await;
            last_line = line;
        }
    }
}
