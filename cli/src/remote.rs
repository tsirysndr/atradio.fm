//! atradio Connect — remote-control client (Spotify-Connect style).
//!
//! Opens a WebSocket to the AppView hub (`/connect`), authenticates with an
//! atproto service-auth JWT, registers this process as a controllable device on
//! the account, broadcasts its playback state, and relays remote-control
//! commands back for the owning thread to apply. Modeled on [`crate::mpris`]:
//! the audio engine handle is `!Send`, so this module only ever holds Send-safe
//! channels — commands flow out over an `mpsc`, state flows in over a `watch`.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message;

use crate::atproto::Atproto;

/// The lexicon method the service-auth token is bound to (matches the hub).
const CONNECT_LXM: &str = "fm.atradio.connect";
/// The token audience — a DID *service reference* (bare DID + `#fragment`); a
/// bare DID is rejected by atproto's OAuth scope parser. Must match the
/// AppView's `CONNECT_SERVICE_AUD` and the `?aud=` in `atradio_scopes()`.
const DEFAULT_SERVICE_AUD: &str = "did:web:api.atradio.fm#atradio_appview";

/// Minimal station description exchanged over the wire.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct StationLite {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favicon: Option<String>,
}

/// A device's playback snapshot, broadcast to peers and shown in the roster.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WireState {
    pub playing: bool,
    #[serde(default)]
    pub station: Option<StationLite>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub volume: f32,
    pub muted: bool,
}

/// A device in the account roster.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default, rename = "self")]
    pub is_self: bool,
    #[serde(default)]
    pub state: WireState,
}

/// A command to apply to *our* player (received from a peer).
#[derive(Clone, Debug)]
pub enum RemoteCmd {
    PlayPause,
    Play,
    Pause,
    Stop,
    SetVolume(f32),
    ToggleMute,
    LoadStation(StationLite),
}

/// An event surfaced to the UI/daemon.
#[derive(Clone, Debug)]
#[allow(dead_code)] // `any_playing` is carried for consumers that want it
pub enum RemoteEvent {
    /// Connection status changed (true = online).
    Status(bool),
    /// The hub acknowledged us with our device id.
    Welcome(String),
    /// Fresh account roster.
    Devices(Vec<Device>),
    /// Presence summary; `cleanup` asks us to delete our `actor.status` record.
    Presence { any_playing: bool, cleanup: bool },
    /// We repeatedly couldn't mint a service-auth token — the OAuth session is
    /// stale/expired and the user needs to sign in again. Emitted at most once
    /// per stretch of failures (reset once we reconnect).
    AuthExpired,
}

/// Cloneable handle to send commands to *other* devices.
#[derive(Clone)]
pub struct RemoteControl {
    tx: mpsc::UnboundedSender<Outbound>,
}

enum Outbound {
    Command { target: String, cmd: RemoteCmd },
}

impl RemoteControl {
    /// Send a control command to a peer device.
    pub fn command(&self, target: impl Into<String>, cmd: RemoteCmd) {
        let _ = self.tx.send(Outbound::Command {
            target: target.into(),
            cmd,
        });
    }
}

pub struct RemoteConfig {
    pub base_url: String,
    pub device_id: String,
    pub device_name: String,
    pub atproto: Arc<Atproto>,
}

/// The spawned client's handles.
pub struct Remote {
    /// Commands from peers to apply to the local player.
    pub cmd_rx: mpsc::UnboundedReceiver<RemoteCmd>,
    /// Roster / presence / status events for the UI.
    pub evt_rx: mpsc::UnboundedReceiver<RemoteEvent>,
    /// Send commands to other devices.
    pub control: RemoteControl,
}

/// Spawn the Connect client. Feed it this device's state through `state`;
/// the returned channels carry inbound commands and UI events.
pub fn spawn(cfg: RemoteConfig, state: watch::Receiver<WireState>) -> Remote {
    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
    let (evt_tx, evt_rx) = mpsc::unbounded_channel();
    let (out_tx, out_rx) = mpsc::unbounded_channel();
    tokio::spawn(run(cfg, state, cmd_tx, evt_tx, out_rx));
    Remote {
        cmd_rx,
        evt_rx,
        control: RemoteControl { tx: out_tx },
    }
}

async fn run(
    cfg: RemoteConfig,
    mut state: watch::Receiver<WireState>,
    cmd_tx: mpsc::UnboundedSender<RemoteCmd>,
    evt_tx: mpsc::UnboundedSender<RemoteEvent>,
    mut out_rx: mpsc::UnboundedReceiver<Outbound>,
) {
    /// Consecutive token-mint failures before we surface "session expired".
    const AUTH_FAILURE_THRESHOLD: u32 = 2;

    let mut backoff = 1000u64;
    let mut mint_failures = 0u32;
    let mut auth_notified = false;
    loop {
        let service_aud = discover_service_aud(&cfg.base_url).await;

        // Mint the service-auth token up front so we can tell an auth/session
        // problem (retrying won't help until the user re-logs) apart from a
        // transient WebSocket drop.
        let token = match cfg
            .atproto
            .mint_service_auth(&service_aud, CONNECT_LXM)
            .await
        {
            Ok(t) => {
                mint_failures = 0;
                t
            }
            Err(_) => {
                mint_failures += 1;
                if mint_failures >= AUTH_FAILURE_THRESHOLD && !auth_notified {
                    auth_notified = true;
                    let _ = evt_tx.send(RemoteEvent::AuthExpired);
                }
                let _ = evt_tx.send(RemoteEvent::Status(false));
                tokio::time::sleep(Duration::from_millis(backoff)).await;
                backoff = (backoff * 2).min(15000);
                continue;
            }
        };

        match connect_once(&cfg, token, &mut state, &cmd_tx, &evt_tx, &mut out_rx).await {
            Ok(true) => return, // local shutdown (state/control dropped)
            Ok(false) | Err(_) => {}
        }
        // We had a live connection (or a post-auth failure); a fresh mint above
        // proves the session is fine, so allow a new prompt if it dies later.
        auth_notified = false;
        let _ = evt_tx.send(RemoteEvent::Status(false));
        tokio::time::sleep(Duration::from_millis(backoff)).await;
        backoff = (backoff * 2).min(15000);
    }
}

/// One connection attempt. Returns `Ok(true)` when the caller should stop
/// (this device is shutting down), `Ok(false)`/`Err` to reconnect.
async fn connect_once(
    cfg: &RemoteConfig,
    token: String,
    state: &mut watch::Receiver<WireState>,
    cmd_tx: &mpsc::UnboundedSender<RemoteCmd>,
    evt_tx: &mpsc::UnboundedSender<RemoteEvent>,
    out_rx: &mut mpsc::UnboundedReceiver<Outbound>,
) -> Result<bool> {
    let (ws, _resp) = tokio_tungstenite::connect_async(ws_url(&cfg.base_url)).await?;
    let (mut sink, mut stream) = ws.split();

    let hello = json!({
        "t": "hello",
        "token": token,
        "device": {
            "id": cfg.device_id,
            "name": cfg.device_name,
            "platform": "cli",
            "state": state.borrow().clone(),
        }
    });
    sink.send(Message::Text(hello.to_string().into())).await?;

    loop {
        tokio::select! {
            msg = stream.next() => {
                let Some(msg) = msg else { return Ok(false) };
                match msg? {
                    Message::Text(txt) => handle_server_text(txt.as_str(), cmd_tx, evt_tx),
                    Message::Ping(p) => sink.send(Message::Pong(p)).await?,
                    Message::Close(_) => return Ok(false),
                    _ => {}
                }
            }
            changed = state.changed() => {
                if changed.is_err() { return Ok(true); } // owner gone → shut down
                let cur = state.borrow().clone();
                let frame = json!({ "t": "state", "state": cur });
                sink.send(Message::Text(frame.to_string().into())).await?;
            }
            out = out_rx.recv() => {
                match out {
                    Some(Outbound::Command { target, cmd }) => {
                        let frame = json!({
                            "t": "command",
                            "target": target,
                            "cmd": cmd_to_json(&cmd),
                        });
                        sink.send(Message::Text(frame.to_string().into())).await?;
                    }
                    None => return Ok(true),
                }
            }
        }
    }
}

fn handle_server_text(
    txt: &str,
    cmd_tx: &mpsc::UnboundedSender<RemoteCmd>,
    evt_tx: &mpsc::UnboundedSender<RemoteEvent>,
) {
    let Ok(v) = serde_json::from_str::<Value>(txt) else {
        return;
    };
    match v.get("t").and_then(Value::as_str) {
        Some("welcome") => {
            if let Some(id) = v.get("deviceId").and_then(Value::as_str) {
                let _ = evt_tx.send(RemoteEvent::Welcome(id.to_string()));
            }
            let _ = evt_tx.send(RemoteEvent::Status(true));
        }
        Some("devices") => {
            if let Some(devs) = v
                .get("devices")
                .and_then(|d| serde_json::from_value::<Vec<Device>>(d.clone()).ok())
            {
                let _ = evt_tx.send(RemoteEvent::Devices(devs));
            }
        }
        Some("command") => {
            if let Some(cmd) = v.get("cmd").and_then(json_to_cmd) {
                let _ = cmd_tx.send(cmd);
            }
        }
        Some("presence") => {
            let any_playing = v
                .get("anyPlaying")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let cleanup = v.get("cleanup").and_then(Value::as_bool).unwrap_or(false);
            let _ = evt_tx.send(RemoteEvent::Presence {
                any_playing,
                cleanup,
            });
        }
        _ => {}
    }
}

fn cmd_to_json(cmd: &RemoteCmd) -> Value {
    match cmd {
        RemoteCmd::PlayPause => json!({ "action": "playPause" }),
        RemoteCmd::Play => json!({ "action": "play" }),
        RemoteCmd::Pause => json!({ "action": "pause" }),
        RemoteCmd::Stop => json!({ "action": "stop" }),
        RemoteCmd::SetVolume(v) => json!({ "action": "setVolume", "value": v }),
        RemoteCmd::ToggleMute => json!({ "action": "toggleMute" }),
        RemoteCmd::LoadStation(s) => json!({ "action": "playStation", "station": s }),
    }
}

fn json_to_cmd(v: &Value) -> Option<RemoteCmd> {
    match v.get("action").and_then(Value::as_str)? {
        "playPause" => Some(RemoteCmd::PlayPause),
        "play" => Some(RemoteCmd::Play),
        "pause" => Some(RemoteCmd::Pause),
        "stop" => Some(RemoteCmd::Stop),
        "toggleMute" => Some(RemoteCmd::ToggleMute),
        "setVolume" => v
            .get("value")
            .and_then(Value::as_f64)
            .map(|f| RemoteCmd::SetVolume(f as f32)),
        "playStation" => v
            .get("station")
            .and_then(|s| serde_json::from_value::<StationLite>(s.clone()).ok())
            .map(RemoteCmd::LoadStation),
        _ => None,
    }
}

async fn discover_service_aud(base: &str) -> String {
    #[derive(Deserialize)]
    struct Health {
        #[serde(rename = "connectAud")]
        connect_aud: Option<String>,
    }
    match reqwest::get(format!("{}/health", base.trim_end_matches('/'))).await {
        Ok(r) => match r.json::<Health>().await {
            Ok(h) => h
                .connect_aud
                .unwrap_or_else(|| DEFAULT_SERVICE_AUD.to_string()),
            Err(_) => DEFAULT_SERVICE_AUD.to_string(),
        },
        Err(_) => DEFAULT_SERVICE_AUD.to_string(),
    }
}

fn ws_url(base: &str) -> String {
    let b = base.trim_end_matches('/');
    let b = if let Some(rest) = b.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = b.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        b.to_string()
    };
    format!("{b}/connect")
}

/// A stable device id for this install, persisted next to the session. Avoids a
/// uuid dependency — a time+pid hash is unique enough for one machine.
pub fn load_or_create_device_id(session_path: &Path) -> String {
    let path = session_path.with_file_name("device_id");
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let t = existing.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let id = format!("cli-{:x}-{:x}", std::process::id(), nanos);
    let _ = std::fs::write(&path, &id);
    id
}

/// Default device name (settings.toml can override it): hostname-based.
pub fn default_device_name() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|h| format!("atradio CLI · {h}"))
        .unwrap_or_else(|| "atradio CLI".to_string())
}
