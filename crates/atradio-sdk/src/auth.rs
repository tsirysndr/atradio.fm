//! Identity + session helpers: the locally-cached [`Profile`], the atradio OAuth
//! scope set, and a best-effort public-profile lookup used at login time.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{auth_err, Result};

/// A tiny locally-cached identity, written on login so `whoami`-style calls and
/// personalized reads work without a network round-trip.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub did: String,
    pub handle: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub pds: Option<String>,
    /// `"password"` | `"oauth"`.
    #[serde(default)]
    pub method: String,
}

impl Profile {
    /// `"Display Name (@handle)"` when a display name is known, else `"@handle"`.
    pub fn label(&self) -> String {
        match self.display_name.as_deref().filter(|d| !d.trim().is_empty()) {
            Some(name) => format!("{name} (@{})", self.handle),
            None => format!("@{}", self.handle),
        }
    }

    /// True when this session was created via the browser OAuth flow.
    pub fn is_oauth(&self) -> bool {
        self.method == "oauth"
    }

    fn path(session_path: &Path) -> PathBuf {
        session_path.with_file_name("profile.json")
    }

    pub fn load(session_path: &Path) -> Option<Profile> {
        let bytes = std::fs::read(Self::path(session_path)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn save(&self, session_path: &Path) -> Result<()> {
        let p = Self::path(session_path);
        if let Some(dir) = p.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(p, serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }

    pub fn clear(session_path: &Path) {
        let _ = std::fs::remove_file(Self::path(session_path));
    }
}

/// The OAuth scope set the SDK requests: atproto + write to every `fm.atradio.*`
/// collection, plus the `getServiceAuth` scope that authenticates the atradio
/// Connect WebSocket. Shared by login and write-resume.
pub(crate) fn atradio_scopes() -> Result<jacquard::oauth::scopes::Scopes<smol_str::SmolStr>> {
    use jacquard::oauth::scopes::Scope;
    jacquard::oauth::scopes::Scopes::builder()
        .atproto()
        .repo_collection("fm.atradio.station")
        .map_err(auth_err)?
        .repo_collection("fm.atradio.favorite")
        .map_err(auth_err)?
        .repo_collection("fm.atradio.comment")
        .map_err(auth_err)?
        .repo_collection("fm.atradio.reaction")
        .map_err(auth_err)?
        .repo_collection("fm.atradio.actor.status")
        .map_err(auth_err)?
        .repo_collection("fm.atradio.audio.settings")
        .map_err(auth_err)?
        // Allow minting the service-auth token that authenticates the atradio
        // Connect WebSocket. The audience is a DID *service reference* (a bare
        // DID is rejected by the scope parser) and must match the AppView's
        // CONNECT_SERVICE_AUD.
        .scope(
            Scope::rpc_aud(
                "fm.atradio.connect",
                "did:web:api.atradio.fm#atradio_appview",
            )
            .map_err(auth_err)?,
        )
        .build()
        .map_err(auth_err)
}

/// Best-effort lookup of an actor's handle + display name from the public
/// Bluesky AppView (the same source atradio's own AppView uses). Returns `None`
/// on any failure so login never blocks on it. `actor` may be a DID or a handle.
pub(crate) async fn fetch_profile(actor: &str) -> Option<(Option<String>, Option<String>)> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ProfileOut {
        #[serde(default)]
        handle: Option<String>,
        #[serde(default)]
        display_name: Option<String>,
    }
    let url = format!("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={actor}");
    let out: ProfileOut = reqwest::get(&url).await.ok()?.json().await.ok()?;
    let clean = |s: Option<String>| s.filter(|v| !v.trim().is_empty());
    Some((clean(out.handle), clean(out.display_name)))
}
