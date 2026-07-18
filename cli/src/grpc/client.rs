//! gRPC control client: this `atradio` driving another one over its control
//! API (unix socket or TCP). Used when startup negotiation finds an instance
//! already serving, or when `--connect` is given.
//!
//! The TUI loop is `!Send` (it owns the player), so the tonic client lives on
//! a small background runtime. Edits update a local mirror optimistically (so
//! the UI reacts instantly) and are queued to the server in order; a
//! `WatchState` stream keeps the mirror authoritative — including changes made
//! by the server's own TUI or other clients.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, Result};
use hyper_util::rt::TokioIo;
use tokio::sync::mpsc;
use tonic::service::interceptor::InterceptedService;
use tonic::transport::{Channel, Endpoint, Uri};

use super::api::v1 as pb;
use super::api::v1::atradio_control_client::AtradioControlClient;
use super::{pb_to_state, pb_to_station, station_to_pb, GrpcState, StationSource};
use crate::player::dsp::AudioSettings;
use crate::remote::{StationLite, WireState};

/// Adds `authorization: Bearer <token>` to every call when a token is set
/// (required by a remote's TCP endpoint; unix sockets need no token).
#[derive(Clone)]
struct ClientAuth {
    header: Option<tonic::metadata::MetadataValue<tonic::metadata::Ascii>>,
}

impl tonic::service::Interceptor for ClientAuth {
    fn call(
        &mut self,
        mut request: tonic::Request<()>,
    ) -> Result<tonic::Request<()>, tonic::Status> {
        if let Some(header) = &self.header {
            request
                .metadata_mut()
                .insert("authorization", header.clone());
        }
        Ok(request)
    }
}

type Client = AtradioControlClient<InterceptedService<Channel, ClientAuth>>;

/// Local copy of the controlled instance's state, read by the TUI each frame.
#[derive(Default)]
struct Mirror {
    wire: WireState,
    audio: AudioSettings,
    /// Transport problem (lost stream / failed RPC), shown until it recovers.
    conn_error: Option<String>,
}

/// The controlled account's browsable lists, fetched over gRPC on demand.
#[derive(Default, Clone)]
pub struct RemoteLists {
    pub favorites: Vec<StationLite>,
    pub stations: Vec<StationLite>,
    pub recent: Vec<StationLite>,
}

enum Cmd {
    PlayPause,
    ToggleMute,
    SetVolume(f32),
    LoadStation(StationLite),
    AdjustDspRow(usize, i32),
    Favorite(StationLite),
    ListStations(StationSource),
}

pub struct GrpcRemote {
    mirror: Arc<Mutex<Mirror>>,
    lists: Arc<Mutex<RemoteLists>>,
    cmds: mpsc::UnboundedSender<Cmd>,
    /// Commands sent but not yet acknowledged; while nonzero, watch updates skip
    /// the controllable fields so a stale snapshot can't undo an optimistic edit.
    pending: Arc<AtomicUsize>,
    /// Keeps the client runtime (and its background tasks) alive. `Option` so
    /// `Drop` can shut it down in the background — dropping a runtime blocks,
    /// which panics inside the TUI's own runtime.
    rt: Option<tokio::runtime::Runtime>,
}

impl Drop for GrpcRemote {
    fn drop(&mut self) {
        if let Some(rt) = self.rt.take() {
            rt.shutdown_background();
        }
    }
}

/// Dial `addr`, fetch the initial state, and start the mirror + command loops.
/// `addr` forms: `unix:PATH`, a bare path, `host:port`, or `http://host:port`.
pub fn connect(addr: &str, token: Option<String>) -> Result<GrpcRemote> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .enable_all()
        .build()
        .context("failed to start gRPC client runtime")?;

    let header = match &token {
        Some(t) => Some(
            format!("Bearer {t}")
                .parse()
                .context("token has characters not allowed in an HTTP header")?,
        ),
        None => None,
    };
    let auth = ClientAuth { header };

    let channel = rt
        .block_on(dial(addr))
        .with_context(|| format!("cannot connect to {}", describe(addr)))?;
    let mut client = AtradioControlClient::with_interceptor(channel, auth);

    let initial = rt
        .block_on(client.get_state(pb::GetStateRequest {}))
        .with_context(|| format!("GetState failed on {}", describe(addr)))?
        .into_inner();

    let mut mirror = Mirror::default();
    apply_state(&mut mirror, pb_to_state(&initial), true);
    let mirror = Arc::new(Mutex::new(mirror));

    let lists = Arc::new(Mutex::new(RemoteLists::default()));
    let pending = Arc::new(AtomicUsize::new(0));
    let (tx, rx) = mpsc::unbounded_channel();

    rt.spawn(watch_loop(
        client.clone(),
        Arc::clone(&mirror),
        Arc::clone(&pending),
    ));
    rt.spawn(command_loop(
        client,
        rx,
        Arc::clone(&mirror),
        Arc::clone(&lists),
        Arc::clone(&pending),
    ));

    Ok(GrpcRemote {
        mirror,
        lists,
        cmds: tx,
        pending,
        rt: Some(rt),
    })
}

/// Human-readable target for status/error messages.
fn describe(addr: &str) -> String {
    addr.strip_prefix("unix:").unwrap_or(addr).to_string()
}

async fn dial(addr: &str) -> Result<Channel> {
    let unix_path = if let Some(path) = addr.strip_prefix("unix:") {
        Some(path.to_string())
    } else if addr.contains('/') && !addr.starts_with("http") {
        Some(addr.to_string())
    } else {
        None
    };

    if let Some(path) = unix_path {
        // The URI is ignored for a unix transport, but an Endpoint needs one.
        let channel = Endpoint::try_from("http://[::1]:7799")?
            .connect_with_connector(tower::service_fn(move |_: Uri| {
                let path = path.clone();
                async move {
                    Ok::<_, std::io::Error>(TokioIo::new(
                        tokio::net::UnixStream::connect(path).await?,
                    ))
                }
            }))
            .await?;
        return Ok(channel);
    }

    let url = if addr.starts_with("http://") || addr.starts_with("https://") {
        addr.to_string()
    } else {
        format!("http://{addr}")
    };
    Ok(Endpoint::try_from(url)?
        .connect_timeout(Duration::from_secs(5))
        .connect()
        .await?)
}

/// Copy a fresh snapshot into the mirror. When not `settled` (a local edit is
/// in flight) only the server-only now-playing title is taken, so the stale
/// snapshot can't briefly undo the optimistic edit.
fn apply_state(m: &mut Mirror, gs: GrpcState, settled: bool) {
    if settled {
        m.wire = gs.wire;
        m.audio = gs.audio;
    } else {
        m.wire.title = gs.wire.title;
    }
}

/// Follow `WatchState`, reconnecting with a short backoff so a restarted server
/// picks the controller back up.
async fn watch_loop(mut client: Client, mirror: Arc<Mutex<Mirror>>, pending: Arc<AtomicUsize>) {
    loop {
        match client.watch_state(pb::WatchStateRequest {}).await {
            Ok(response) => {
                let mut stream = response.into_inner();
                loop {
                    match stream.message().await {
                        Ok(Some(state)) => {
                            let mut m = mirror.lock().unwrap();
                            m.conn_error = None;
                            let settled = pending.load(Ordering::Acquire) == 0;
                            apply_state(&mut m, pb_to_state(&state), settled);
                        }
                        Ok(None) => break,
                        Err(err) => {
                            mirror.lock().unwrap().conn_error =
                                Some(format!("connection lost: {err}"));
                            break;
                        }
                    }
                }
            }
            Err(err) => {
                mirror.lock().unwrap().conn_error = Some(format!("connection lost: {err}"));
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn command_loop(
    mut client: Client,
    mut rx: mpsc::UnboundedReceiver<Cmd>,
    mirror: Arc<Mutex<Mirror>>,
    lists: Arc<Mutex<RemoteLists>>,
    pending: Arc<AtomicUsize>,
) {
    while let Some(cmd) = rx.recv().await {
        // List fetches are read-only — they don't participate in the optimistic
        // `pending` count that guards state edits.
        if let Cmd::ListStations(source) = &cmd {
            let source = *source;
            let pb_source = match source {
                StationSource::Favorites => pb::StationSource::Favorites,
                StationSource::Stations => pb::StationSource::Stations,
                StationSource::Recent => pb::StationSource::Recent,
            };
            match client
                .list_stations(pb::ListStationsRequest {
                    source: pb_source as i32,
                    limit: 0,
                })
                .await
            {
                Ok(resp) => {
                    let fetched: Vec<StationLite> = resp
                        .into_inner()
                        .stations
                        .iter()
                        .map(pb_to_station)
                        .collect();
                    let mut l = lists.lock().unwrap();
                    match source {
                        StationSource::Favorites => l.favorites = fetched,
                        StationSource::Stations => l.stations = fetched,
                        StationSource::Recent => l.recent = fetched,
                    }
                }
                Err(status) => {
                    mirror.lock().unwrap().conn_error = Some(format!("list failed: {status}"));
                }
            }
            continue;
        }

        let result = match cmd {
            Cmd::PlayPause => client.play_pause(pb::PlayPauseRequest {}).await.map(drop),
            Cmd::ToggleMute => client.toggle_mute(pb::ToggleMuteRequest {}).await.map(drop),
            Cmd::SetVolume(v) => client
                .set_volume(pb::SetVolumeRequest { volume: v })
                .await
                .map(drop),
            Cmd::LoadStation(s) => client
                .load_station(pb::LoadStationRequest {
                    station: Some(station_to_pb(&s)),
                })
                .await
                .map(drop),
            Cmd::AdjustDspRow(row, dir) => client
                .adjust_dsp_row(pb::AdjustDspRowRequest {
                    row: row as u32,
                    dir,
                })
                .await
                .map(drop),
            Cmd::Favorite(s) => client
                .favorite(pb::FavoriteRequest {
                    station: Some(station_to_pb(&s)),
                })
                .await
                .map(drop),
            Cmd::ListStations(_) => unreachable!("handled above"),
        };
        pending.fetch_sub(1, Ordering::AcqRel);
        if let Err(status) = result {
            mirror.lock().unwrap().conn_error = Some(format!("rpc failed: {status}"));
        }
    }
}

impl GrpcRemote {
    fn send(&self, cmd: Cmd) {
        self.pending.fetch_add(1, Ordering::AcqRel);
        if self.cmds.send(cmd).is_err() {
            self.pending.fetch_sub(1, Ordering::AcqRel);
        }
    }

    /// Snapshot the mirror for rendering: playback state, DSP, and any error.
    pub fn snapshot(&self) -> (WireState, AudioSettings, Option<String>) {
        let m = self.mirror.lock().unwrap();
        (m.wire.clone(), m.audio.clone(), m.conn_error.clone())
    }

    /// Snapshot the controlled account's browsable lists.
    pub fn lists(&self) -> RemoteLists {
        self.lists.lock().unwrap().clone()
    }

    /// Refresh all three account lists from the controlled instance (async; the
    /// results land in [`Self::lists`] when they arrive).
    pub fn request_lists(&self) {
        for source in [
            StationSource::Favorites,
            StationSource::Stations,
            StationSource::Recent,
        ] {
            let _ = self.cmds.send(Cmd::ListStations(source));
        }
    }

    pub fn play_pause(&self) {
        {
            let mut m = self.mirror.lock().unwrap();
            m.wire.playing = !m.wire.playing;
        }
        self.send(Cmd::PlayPause);
    }

    pub fn toggle_mute(&self) {
        {
            let mut m = self.mirror.lock().unwrap();
            m.wire.muted = !m.wire.muted;
        }
        self.send(Cmd::ToggleMute);
    }

    pub fn set_volume(&self, v: f32) {
        let v = v.clamp(0.0, 1.0);
        self.mirror.lock().unwrap().wire.volume = v;
        self.send(Cmd::SetVolume(v));
    }

    /// Nudge the remote volume relative to its last-known value.
    pub fn bump_volume(&self, delta: f32) {
        let next = {
            let m = self.mirror.lock().unwrap();
            (m.wire.volume + delta).clamp(0.0, 1.0)
        };
        self.set_volume(next);
    }

    pub fn load_station(&self, station: StationLite) {
        {
            let mut m = self.mirror.lock().unwrap();
            m.wire.station = Some(station.clone());
            m.wire.playing = true;
        }
        self.send(Cmd::LoadStation(station));
    }

    pub fn adjust_dsp_row(&self, row: usize, dir: i32) {
        {
            let mut m = self.mirror.lock().unwrap();
            crate::tui::dsp_rows::adjust(&mut m.audio, row, dir);
        }
        self.send(Cmd::AdjustDspRow(row, dir));
    }

    pub fn favorite(&self, station: StationLite) {
        self.send(Cmd::Favorite(station));
    }
}
