//! gRPC control API server: a unix socket by default (a second `atradio`
//! connecting to control this one), plus TCP/HTTP2 when a port is configured.
//! Reflection + grpc-web are enabled so `grpcurl` and browsers work.
//!
//! Runs on its own thread with a small tokio runtime and holds ONLY channels —
//! never the `!Send` player. Commands are forwarded to the owning loop over an
//! `mpsc`; state is read from a `watch` channel the loop keeps fresh.

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use tokio::sync::{mpsc, oneshot, watch};
use tokio_stream::wrappers::{ReceiverStream, TcpListenerStream, UnixListenerStream};
use tonic::transport::Server;
use tonic::{Request, Response, Status};

use super::api::v1 as pb;
use super::api::v1::atradio_control_server::{AtradioControl, AtradioControlServer};
use super::api::FILE_DESCRIPTOR_SET;
use super::{audio_to_pb, pb_to_audio, pb_to_station, state_to_pb, GrpcCmd, GrpcState};
use crate::remote::RemoteCmd;

/// Where to serve the control API, after CLI/config resolution. `token` guards
/// the TCP endpoint only — the unix socket is restricted by file permissions.
pub struct Endpoints {
    pub socket: Option<PathBuf>,
    pub tcp: Option<SocketAddr>,
    pub token: Option<String>,
}

/// Require `authorization: Bearer <token>` on every RPC when a token is set.
#[derive(Clone)]
pub struct Auth {
    token: Option<Arc<str>>,
}

impl tonic::service::Interceptor for Auth {
    fn call(&mut self, request: Request<()>) -> Result<Request<()>, Status> {
        let Some(token) = &self.token else {
            return Ok(request);
        };
        let sent = request
            .metadata()
            .get("authorization")
            .and_then(|v| v.to_str().ok());
        match sent {
            Some(v) if v.strip_prefix("Bearer ").unwrap_or(v) == token.as_ref() => Ok(request),
            _ => Err(Status::unauthenticated(
                "missing or invalid token: send `authorization: Bearer <token>` \
                 (see [grpc].token in the server's settings.toml)",
            )),
        }
    }
}

/// 192-bit random hex token for the TCP endpoint, persisted to settings.
pub fn generate_token() -> Result<String> {
    use std::io::Read;
    let mut buf = [0u8; 24];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .context("cannot read /dev/urandom to generate an API token")?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// Is `path` a live atradio control socket? Used by the startup negotiation.
pub fn socket_is_live(path: &Path) -> bool {
    path.exists() && std::os::unix::net::UnixStream::connect(path).is_ok()
}

#[derive(Clone)]
struct Service {
    cmds: mpsc::UnboundedSender<GrpcCmd>,
    state: watch::Receiver<GrpcState>,
}

impl Service {
    fn snapshot(&self) -> pb::State {
        state_to_pb(&self.state.borrow())
    }
    fn audio(&self) -> pb::AudioSettings {
        audio_to_pb(&self.state.borrow().audio)
    }
    fn send(&self, cmd: GrpcCmd) {
        let _ = self.cmds.send(cmd);
    }
}

#[tonic::async_trait]
impl AtradioControl for Service {
    async fn get_state(
        &self,
        _: Request<pb::GetStateRequest>,
    ) -> Result<Response<pb::State>, Status> {
        Ok(Response::new(self.snapshot()))
    }

    type WatchStateStream = ReceiverStream<Result<pb::State, Status>>;

    async fn watch_state(
        &self,
        _: Request<pb::WatchStateRequest>,
    ) -> Result<Response<Self::WatchStateStream>, Status> {
        let (tx, rx) = mpsc::channel(4);
        let mut state = self.state.clone();
        tokio::spawn(async move {
            // Snapshot into an owned value before each await — a watch `Ref` is
            // !Send and can't be held across the send.
            let snap = state_to_pb(&state.borrow());
            if tx.send(Ok(snap)).await.is_err() {
                return;
            }
            while state.changed().await.is_ok() {
                let snap = state_to_pb(&state.borrow());
                if tx.send(Ok(snap)).await.is_err() {
                    break;
                }
            }
        });
        Ok(Response::new(ReceiverStream::new(rx)))
    }

    async fn play(&self, _: Request<pb::PlayRequest>) -> Result<Response<pb::State>, Status> {
        self.send(GrpcCmd::Remote(RemoteCmd::Play));
        Ok(Response::new(self.snapshot()))
    }
    async fn pause(&self, _: Request<pb::PauseRequest>) -> Result<Response<pb::State>, Status> {
        self.send(GrpcCmd::Remote(RemoteCmd::Pause));
        Ok(Response::new(self.snapshot()))
    }
    async fn stop(&self, _: Request<pb::StopRequest>) -> Result<Response<pb::State>, Status> {
        self.send(GrpcCmd::Remote(RemoteCmd::Stop));
        Ok(Response::new(self.snapshot()))
    }
    async fn play_pause(
        &self,
        _: Request<pb::PlayPauseRequest>,
    ) -> Result<Response<pb::State>, Status> {
        self.send(GrpcCmd::Remote(RemoteCmd::PlayPause));
        Ok(Response::new(self.snapshot()))
    }
    async fn toggle_mute(
        &self,
        _: Request<pb::ToggleMuteRequest>,
    ) -> Result<Response<pb::State>, Status> {
        self.send(GrpcCmd::Remote(RemoteCmd::ToggleMute));
        Ok(Response::new(self.snapshot()))
    }
    async fn set_volume(
        &self,
        request: Request<pb::SetVolumeRequest>,
    ) -> Result<Response<pb::State>, Status> {
        let v = request.into_inner().volume.clamp(0.0, 1.0);
        self.send(GrpcCmd::Remote(RemoteCmd::SetVolume(v)));
        Ok(Response::new(self.snapshot()))
    }
    async fn load_station(
        &self,
        request: Request<pb::LoadStationRequest>,
    ) -> Result<Response<pb::State>, Status> {
        let station = request
            .into_inner()
            .station
            .ok_or_else(|| Status::invalid_argument("station is required"))?;
        self.send(GrpcCmd::Remote(RemoteCmd::LoadStation(pb_to_station(
            &station,
        ))));
        Ok(Response::new(self.snapshot()))
    }

    async fn get_audio_settings(
        &self,
        _: Request<pb::GetAudioSettingsRequest>,
    ) -> Result<Response<pb::AudioSettings>, Status> {
        Ok(Response::new(self.audio()))
    }
    async fn set_audio_settings(
        &self,
        request: Request<pb::SetAudioSettingsRequest>,
    ) -> Result<Response<pb::AudioSettings>, Status> {
        let audio = request
            .into_inner()
            .audio
            .ok_or_else(|| Status::invalid_argument("audio is required"))?;
        let settings = pb_to_audio(&audio);
        let echo = audio_to_pb(&settings);
        self.send(GrpcCmd::SetAudio(settings));
        Ok(Response::new(echo))
    }
    async fn adjust_dsp_row(
        &self,
        request: Request<pb::AdjustDspRowRequest>,
    ) -> Result<Response<pb::AudioSettings>, Status> {
        let req = request.into_inner();
        self.send(GrpcCmd::AdjustDspRow {
            row: req.row as usize,
            dir: req.dir,
        });
        // Pre-apply snapshot; the WatchState stream carries the applied result.
        Ok(Response::new(self.audio()))
    }

    async fn favorite(
        &self,
        request: Request<pb::FavoriteRequest>,
    ) -> Result<Response<pb::FavoriteResponse>, Status> {
        let station = request
            .into_inner()
            .station
            .ok_or_else(|| Status::invalid_argument("station is required"))?;
        let (tx, rx) = oneshot::channel();
        self.send(GrpcCmd::Favorite(pb_to_station(&station), tx));
        match tokio::time::timeout(Duration::from_secs(15), rx).await {
            Ok(Ok(Ok(uri))) => Ok(Response::new(pb::FavoriteResponse { uri })),
            Ok(Ok(Err(e))) => Err(Status::internal(e)),
            _ => Err(Status::unavailable("favorite timed out")),
        }
    }
}

/// Claim the unix socket path. A live socket is a hard error (the caller should
/// connect instead); a stale (dead) socket file is removed and rebound.
fn bind_socket(path: &Path) -> Result<std::os::unix::net::UnixListener> {
    if socket_is_live(path) {
        bail!(
            "another atradio is already serving {} — control it with \
             `atradio --connect`, or stop it first",
            path.display()
        );
    }
    if path.exists() {
        std::fs::remove_file(path)
            .with_context(|| format!("cannot remove stale socket {}", path.display()))?;
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("cannot create {}", parent.display()))?;
    }
    std::os::unix::net::UnixListener::bind(path)
        .with_context(|| format!("cannot bind socket {}", path.display()))
}

fn router(svc: Service, auth: Auth) -> Result<tonic::transport::server::Router> {
    let reflection = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(FILE_DESCRIPTOR_SET)
        .build_v1()
        .context("failed to build reflection service")?;
    Ok(Server::builder()
        .add_service(reflection)
        .add_service(AtradioControlServer::with_interceptor(svc, auth)))
}

/// Bind the configured endpoints (fail-fast, on the caller's thread), then
/// serve them from a background thread. Returns what was actually bound.
pub fn spawn(
    endpoints: Endpoints,
    cmds: mpsc::UnboundedSender<GrpcCmd>,
    state: watch::Receiver<GrpcState>,
) -> Result<Endpoints> {
    let socket = match &endpoints.socket {
        Some(path) => Some((path.clone(), bind_socket(path)?)),
        None => None,
    };
    let tcp = match endpoints.tcp {
        Some(addr) => Some((
            addr,
            std::net::TcpListener::bind(addr).with_context(|| format!("cannot bind tcp {addr}"))?,
        )),
        None => None,
    };

    let bound = Endpoints {
        socket: socket.as_ref().map(|(p, _)| p.clone()),
        tcp: tcp.as_ref().map(|(a, _)| *a),
        token: endpoints.token.clone(),
    };

    let tcp_auth = Auth {
        token: endpoints.token.map(Arc::from),
    };
    let svc = Service { cmds, state };

    std::thread::Builder::new()
        .name("grpc-api".to_string())
        .spawn(move || {
            let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            else {
                return;
            };
            rt.block_on(async move {
                let mut tasks = Vec::new();
                if let Some((_path, listener)) = socket {
                    listener.set_nonblocking(true).ok();
                    if let (Ok(listener), Ok(router)) = (
                        tokio::net::UnixListener::from_std(listener),
                        router(svc.clone(), Auth { token: None }),
                    ) {
                        tasks.push(tokio::spawn(async move {
                            let incoming = UnixListenerStream::new(listener);
                            let _ = router.serve_with_incoming(incoming).await;
                        }));
                    }
                }
                if let Some((_addr, listener)) = tcp {
                    listener.set_nonblocking(true).ok();
                    if let (Ok(listener), Ok(router)) = (
                        tokio::net::TcpListener::from_std(listener),
                        router(svc, tcp_auth),
                    ) {
                        tasks.push(tokio::spawn(async move {
                            let incoming = TcpListenerStream::new(listener);
                            let _ = router.serve_with_incoming(incoming).await;
                        }));
                    }
                }
                for task in tasks {
                    task.await.ok();
                }
            });
        })
        .context("failed to spawn gRPC server thread")?;

    Ok(bound)
}
