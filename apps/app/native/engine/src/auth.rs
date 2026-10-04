//! OAuth uses the system browser and a loopback callback, as atradio's CLI does.
//! Tokens and DPoP keys stay in Android's no-backup private directory, never JS.
use std::{path::PathBuf, sync::{Mutex, OnceLock, atomic::{AtomicU64, Ordering}}};
use serde_json::{json, Value};
use jacquard::client::{Agent, FileAuthStore};
use jacquard::oauth::{atproto::AtprotoClientMetadata, client::OAuthClient, loopback::{one_shot_server, handle_localhost_callback, LoopbackConfig, LoopbackPort}, session::ClientData, types::AuthorizeOptions};
use atradio_sdk::{AtradioAgent, Profile};

static GENERATION: AtomicU64 = AtomicU64::new(0);
static STATE: OnceLock<Mutex<Value>> = OnceLock::new();
fn state() -> &'static Mutex<Value> { STATE.get_or_init(|| Mutex::new(json!({"state":"signedOut"}))) }
fn runtime() -> &'static tokio::runtime::Runtime {
  static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
  RT.get_or_init(|| tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().expect("OAuth runtime"))
}
fn put(generation: u64, value: Value) {
  let mut s = state().lock().unwrap();
  if GENERATION.load(Ordering::SeqCst) == generation { *s = value; }
}
async fn login(dir: PathBuf, handle: String, generation: u64) -> Result<(), String> {
  let pending = dir.join(format!("pending-{generation}"));
  std::fs::create_dir_all(&pending).map_err(|e| e.to_string())?;
  let pending_file = pending.join("session.json");
  let http = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)).build().map_err(|e| e.to_string())?;
  let store = FileAuthStore::new(pending_file.to_string_lossy().to_string());
  let client = OAuthClient::new(store, ClientData { keyset: None, config: AtprotoClientMetadata::default_localhost() }, http.clone());
  let cfg = LoopbackConfig { host: "127.0.0.1".into(), port: LoopbackPort::Ephemeral, open_browser: false, timeout_ms: 300_000 };
  let opts = AuthorizeOptions::default();
  let (addr, callback) = one_shot_server("127.0.0.1:0").await.map_err(|e| e.to_string())?;
  let data = client.build_localhost_client_data(&cfg, &opts, addr);
  let flow = OAuthClient::new(FileAuthStore::new(pending_file.to_string_lossy().to_string()), data, http);
  let url = flow.start_auth(&handle, opts).await.map_err(|e| e.to_string())?;
  put(generation, json!({"state":"authorizing","url":url}));
  let session = tokio::select! {
    s = handle_localhost_callback(callback, &flow, &cfg) => s.map_err(|e| e.to_string())?,
    _ = async { while GENERATION.load(Ordering::SeqCst)==generation { tokio::time::sleep(std::time::Duration::from_millis(200)).await; } } => { return Err("Sign-in cancelled".into()); }
  };
  let agent = Agent::from(session);
  let (did, _) = agent.info().await.ok_or("OAuth session has no identity")?;
  let profile = Profile { did: did.to_string(), handle, display_name: None, pds: None, method: "oauth".into() };
  // Commit only the active attempt; cancelled callbacks cannot sign a user in.
  {
    let mut s = state().lock().unwrap();
    if GENERATION.load(Ordering::SeqCst) != generation { return Ok(()); }
    std::fs::copy(&pending_file, dir.join("session.json")).map_err(|e| e.to_string())?;
    profile.save(&dir.join("session.json")).map_err(|e| e.to_string())?;
    *s = json!({"state":"signedIn","profile":profile});
  }
  let _ = std::fs::remove_dir_all(pending);
  Ok(())
}
pub fn handle(input: &str) -> Option<String> {
  let v: Value = serde_json::from_str(input).ok()?;
  let cmd = v["cmd"].as_str()?;
  if !cmd.starts_with("auth") { return None; }
  let dir = PathBuf::from(v["path"].as_str().unwrap_or(""));
  if !dir.is_absolute() { return Some(json!({"state":"error","error":"Private session directory unavailable"}).to_string()); }
  match cmd {
    "authStart" => {
      let generation = GENERATION.fetch_add(1, Ordering::SeqCst)+1;
      let handle = v["handle"].as_str().unwrap_or("").to_string();
      put(generation, json!({"state":"starting"}));
      runtime().spawn(async move {
        if let Err(error)=login(dir.clone(),handle,generation).await { put(generation,json!({"state":"error","error":error})); }
        let _=std::fs::remove_dir_all(dir.join(format!("pending-{generation}")));
      });
    }
    "authRestore" => {
      let generation = GENERATION.fetch_add(1, Ordering::SeqCst)+1;
      put(generation,json!({"state":"restoring"}));
      runtime().spawn(async move {
        let agent = AtradioAgent::new(dir.join("session.json"));
        if let Some(profile) = agent.profile() {
          match agent.refresh_session().await {
            Ok(()) => put(generation,json!({"state":"signedIn","profile":profile})),
            Err(atradio_sdk::SdkError::SessionExpired | atradio_sdk::SdkError::NotAuthenticated) => { agent.logout(); put(generation,json!({"state":"signedOut"})); },
            Err(_) => put(generation,json!({"state":"signedIn","profile":profile,"offline":true})),
          }
        } else { put(generation,json!({"state":"signedOut"})); }
      });
    }
    "authCancel" | "authLogout" => {
      let mut s=state().lock().unwrap(); GENERATION.fetch_add(1, Ordering::SeqCst);
      if cmd=="authLogout" { AtradioAgent::new(dir.join("session.json")).logout(); }
      *s=json!({"state":"signedOut"});
    }
    _ => {}
  }
  Some(state().lock().unwrap().to_string())
}
