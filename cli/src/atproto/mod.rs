//! atproto integration via jacquard: app-password + OAuth login, and record
//! writes to the user's PDS (favorites, comments, play status).
//!
//! Reads are served by the public AppView ([`crate::appview`]); this module is
//! only for identity and writes, which require an authenticated session.

pub mod profile;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use jacquard::client::credential_session::{
    CredentialLoginOptions, CredentialResumeResult, CredentialSession,
};
use jacquard::client::{Agent, AgentSessionExt, FileAuthStore};
use jacquard::common::session::SessionHint;
use jacquard::identity::JacquardResolver;
use jacquard::types::string::{Datetime, UriValue};
use jacquard_common::types::recordkey::{RecordKey, Rkey};

use crate::appview::StationInfo;
use crate::fm_atradio::actor::status::Status as ActorStatus;
use crate::fm_atradio::comment::Comment;
use crate::fm_atradio::favorite::Favorite;
use crate::fm_atradio::station::Station as StationRecord;
use crate::fm_atradio::StationInfo as GenStation;

/// User input for creating a custom station.
#[derive(Clone, Debug, Default)]
pub struct StationDraft {
    pub name: String,
    pub stream_url: String,
    pub genre: Option<String>,
    pub homepage: Option<String>,
    pub logo: Option<String>,
}

pub use profile::Profile;

/// The atproto client: owns credential material and a handle resolver.
type Resolver = JacquardResolver<reqwest::Client>;

#[derive(Clone)]
pub struct Atproto {
    store: Arc<FileAuthStore>,
    resolver: Arc<Resolver>,
    session_path: PathBuf,
}

impl Atproto {
    pub fn new(session_path: PathBuf) -> Self {
        let store = Arc::new(FileAuthStore::new(
            session_path.to_string_lossy().to_string(),
        ));
        let resolver = Arc::new(JacquardResolver::new(
            reqwest::Client::new(),
            Default::default(),
        ));
        Self {
            store,
            resolver,
            session_path,
        }
    }

    /// The locally-cached identity, if logged in.
    pub fn profile(&self) -> Option<Profile> {
        Profile::load(&self.session_path)
    }

    /// The `actor` to use for personalized AppView reads (handle or DID).
    pub fn actor(&self) -> Option<String> {
        self.profile().map(|p| p.handle)
    }

    pub fn is_logged_in(&self) -> bool {
        self.profile().is_some()
    }

    /// Log out: drop the cached session + profile.
    pub fn logout(&self) {
        Profile::clear(&self.session_path);
        let _ = std::fs::remove_file(&self.session_path);
    }

    // ---- auth ------------------------------------------------------------

    /// Log in with an app password. Persists the session + profile.
    pub async fn login_password(&self, identifier: &str, password: &str) -> Result<Profile> {
        let session = CredentialSession::new(self.store.clone(), self.resolver.clone());
        let hint = SessionHint::from_optional_input(Some(identifier));

        let auth = match session.resume(&hint).await.map_err(to_anyhow)? {
            CredentialResumeResult::Resumed(auth) => auth,
            CredentialResumeResult::LoginRequired(challenge) => session
                .login_from_challenge(
                    challenge,
                    CredentialLoginOptions {
                        password: password.to_string().into(),
                        identifier: Some(identifier.to_string().into()),
                        allow_takendown: None,
                        auth_factor_token: None,
                        pds: None,
                    },
                )
                .await
                .map_err(to_anyhow)?,
        };

        let did = auth.did.to_string();
        // createSession gives us a reliable handle; only the display name needs
        // the public profile lookup.
        let (_, display_name) = fetch_profile(&did).await.unwrap_or((None, None));
        let profile = Profile {
            display_name,
            did,
            handle: auth.handle.to_string(),
            pds: auth.pds.as_ref().map(|u| u.to_string()),
            method: "password".into(),
        };
        profile.save(&self.session_path)?;
        Ok(profile)
    }

    /// Log in via OAuth, opening the browser to the user's PDS. Persists the
    /// session + profile.
    pub async fn login_oauth(&self, input: Option<&str>) -> Result<Profile> {
        use jacquard::oauth::atproto::AtprotoClientMetadata;
        use jacquard::oauth::client::OAuthClient;
        use jacquard::oauth::loopback::LoopbackConfig;
        use jacquard::oauth::types::AuthorizeOptions;

        let client_data = jacquard::oauth::session::ClientData {
            keyset: None,
            config: AtprotoClientMetadata::default_localhost(),
        };
        // OAuthClient takes an owned store; make a fresh file-backed one at the
        // same path so it shares the session with the credential path.
        let store = FileAuthStore::new(self.session_path.to_string_lossy().to_string());
        let oauth = OAuthClient::new(store, client_data, reqwest::Client::new());
        let hint = SessionHint::from_optional_input(input);
        // Request write access to every fm.atradio.* collection the CLI touches.
        let scopes = atradio_scopes()?;

        let session = match oauth
            .resume_or_login_with_local_server(
                &hint,
                AuthorizeOptions::default().with_scopes(scopes.clone()),
                LoopbackConfig::default(),
            )
            .await
            .map_err(to_anyhow)?
        {
            Some(session) => session,
            None => {
                let who = input.ok_or_else(|| {
                    anyhow!("pass a handle, DID, or PDS URL to start OAuth login")
                })?;
                oauth
                    .login_with_local_server(
                        who.to_string(),
                        AuthorizeOptions::default().with_scopes(scopes),
                        LoopbackConfig::default(),
                    )
                    .await
                    .map_err(to_anyhow)?
            }
        };

        let agent: Agent<_> = Agent::from(session);
        // NOTE: `info().1` is the OAuth *session id*, not the handle — resolve
        // the real handle (and display name) from the DID via the public API.
        let (did, _session_id) = agent
            .info()
            .await
            .ok_or_else(|| anyhow!("OAuth session missing identity"))?;
        let did = did.to_string();
        let (handle, display_name) = fetch_profile(&did).await.unwrap_or((None, None));
        let profile = Profile {
            display_name,
            handle: handle.unwrap_or_else(|| did.clone()),
            did,
            pds: None,
            method: "oauth".into(),
        };
        profile.save(&self.session_path)?;
        Ok(profile)
    }

    // ---- writes ----------------------------------------------------------
    //
    // Writes must resume whichever session the user has: app-password
    // (CredentialSession) OR OAuth (OAuthSession). Both implement AgentSession,
    // so `create_record`/`put_record` work on either — we just branch on the
    // persisted `method` and resume the right one.

    fn is_oauth(&self) -> bool {
        self.profile().map(|p| p.method == "oauth").unwrap_or(false)
    }

    /// Resume the app-password session into an agent.
    async fn credential_agent(&self) -> Result<Agent<CredentialSession<FileAuthStore, Resolver>>> {
        let session = CredentialSession::new(self.store.clone(), self.resolver.clone());
        let actor = self.actor();
        let hint = SessionHint::from_optional_input(actor.as_deref());
        match session.resume(&hint).await.map_err(to_anyhow)? {
            CredentialResumeResult::Resumed(_) => Ok(Agent::from(session)),
            CredentialResumeResult::LoginRequired(_) => Err(anyhow!(
                "not signed in — press s (or run `atradio login`) to sign in"
            )),
        }
    }

    /// Create a record on the user's PDS, resuming whichever session exists.
    async fn create<R>(&self, record: R, what: &'static str) -> Result<String>
    where
        R: jacquard_common::types::collection::Collection + serde::Serialize,
    {
        if self.is_oauth() {
            let session = self.resume_oauth().await?;
            let out = Agent::from(session)
                .create_record(record, None)
                .await
                .map_err(to_anyhow)
                .context(what)?;
            Ok(out.uri.to_string())
        } else {
            let out = self
                .credential_agent()
                .await?
                .create_record(record, None)
                .await
                .map_err(to_anyhow)
                .context(what)?;
            Ok(out.uri.to_string())
        }
    }

    /// Put (upsert) a record at `rkey`, resuming whichever session exists.
    async fn put<R>(&self, rkey: RecordKey<Rkey>, record: R, what: &'static str) -> Result<()>
    where
        R: jacquard_common::types::collection::Collection + serde::Serialize,
    {
        if self.is_oauth() {
            let session = self.resume_oauth().await?;
            Agent::from(session)
                .put_record(rkey, record)
                .await
                .map_err(to_anyhow)
                .context(what)?;
        } else {
            self.credential_agent()
                .await?
                .put_record(rkey, record)
                .await
                .map_err(to_anyhow)
                .context(what)?;
        }
        Ok(())
    }

    /// Resume a stored OAuth session (no browser). Errors if it can't be
    /// resumed (expired) so the caller can prompt a fresh sign-in.
    async fn resume_oauth(
        &self,
    ) -> Result<jacquard::oauth::client::OAuthSession<Resolver, FileAuthStore>> {
        use jacquard::oauth::atproto::AtprotoClientMetadata;
        use jacquard::oauth::client::{OAuthClient, OAuthResumeOrLogin};
        use jacquard::oauth::types::AuthorizeOptions;

        let client_data = jacquard::oauth::session::ClientData {
            keyset: None,
            config: AtprotoClientMetadata::default_localhost(),
        };
        let store = FileAuthStore::new(self.session_path.to_string_lossy().to_string());
        let oauth = OAuthClient::new(store, client_data, reqwest::Client::new());
        let actor = self.actor();
        let hint = SessionHint::from_optional_input(actor.as_deref());
        let opts = AuthorizeOptions::default().with_scopes(atradio_scopes()?);
        match oauth
            .resume_or_start_auth(&hint, opts)
            .await
            .map_err(to_anyhow)?
        {
            OAuthResumeOrLogin::Resumed(session) => Ok(session),
            _ => Err(anyhow!(
                "your OAuth session expired — press s to sign in again"
            )),
        }
    }

    /// Favorite a station. Returns the created record URI.
    pub async fn favorite(&self, station: &StationInfo) -> Result<String> {
        let record = Favorite::new()
            .station(gen_station(station))
            .created_at(Datetime::now())
            .build();
        self.create(record, "create favorite").await
    }

    /// Post a comment on a station. Returns the created record URI.
    pub async fn comment(&self, station: &StationInfo, text: &str) -> Result<String> {
        let record = Comment::new()
            .station(gen_station(station))
            .text(text.to_string())
            .created_at(Datetime::now())
            .build();
        self.create(record, "create comment").await
    }

    /// Create a custom station record on the user's PDS. Returns its URI.
    pub async fn create_station(&self, draft: &StationDraft) -> Result<String> {
        let record = StationRecord::new()
            .name(draft.name.clone())
            .stream_url(
                parse_uri(&draft.stream_url)
                    .unwrap_or_else(|| UriValue::Any(draft.stream_url.clone().into())),
            )
            .maybe_genre(draft.genre.clone().map(Into::into))
            .maybe_homepage(draft.homepage.as_deref().and_then(parse_uri))
            .maybe_logo(draft.logo.as_deref().and_then(parse_uri))
            .created_at(Datetime::now())
            .build();
        self.create(record, "create station").await
    }

    /// Update the actor's play-status singleton (so you appear in the
    /// recently-played / listener-count feeds).
    pub async fn set_play_status(&self, station: &StationInfo) -> Result<()> {
        let record = ActorStatus::new()
            .station(gen_station(station))
            .played_at(Datetime::now())
            .build();
        let rkey: RecordKey<Rkey> = "self".parse().map_err(|e| anyhow!("rkey: {e}"))?;
        self.put(rkey, record, "update play status").await
    }
}

/// The OAuth scope set the CLI requests: atproto + write to the fm.atradio.*
/// collections it actually writes. Shared by login and write-resume.
///
/// NOTE: `fm.atradio.audio.settings` is deliberately absent — the TUI's native
/// Rockbox EQ bands (32 Hz…16 kHz) differ from the web build's (60 Hz…20 kHz),
/// so DSP is persisted locally (settings.toml) and never synced to the PDS.
fn atradio_scopes() -> Result<jacquard::oauth::scopes::Scopes<smol_str::SmolStr>> {
    jacquard::oauth::scopes::Scopes::builder()
        .atproto()
        .repo_collection("fm.atradio.station")
        .map_err(to_anyhow)?
        .repo_collection("fm.atradio.favorite")
        .map_err(to_anyhow)?
        .repo_collection("fm.atradio.comment")
        .map_err(to_anyhow)?
        .repo_collection("fm.atradio.reaction")
        .map_err(to_anyhow)?
        .repo_collection("fm.atradio.actor.status")
        .map_err(to_anyhow)?
        .build()
        .map_err(to_anyhow)
}

/// Convert our wire `StationInfo` into the generated (lexicon) `StationInfo`.
fn gen_station(s: &StationInfo) -> GenStation {
    GenStation::new()
        .station_id(s.station_id.clone())
        .name(s.name.clone())
        .stream_url(
            parse_uri(&s.stream_url).unwrap_or_else(|| UriValue::Any(s.stream_url.clone().into())),
        )
        .source(s.source.clone())
        .maybe_description(s.description.clone().map(Into::into))
        .maybe_genre(s.genre.clone().map(Into::into))
        .maybe_homepage(s.homepage.as_deref().and_then(parse_uri))
        .maybe_logo(s.logo.as_deref().and_then(parse_uri))
        .maybe_country(s.country.clone().map(Into::into))
        .maybe_language(s.language.clone().map(Into::into))
        .maybe_codec(s.codec.clone().map(Into::into))
        .bitrate(s.bitrate.map(|b| b as i64))
        .build()
}

/// Parse a URL string into a lexicon `UriValue`, dropping anything invalid.
fn parse_uri(s: &str) -> Option<UriValue> {
    UriValue::new_owned(s).ok()
}

fn to_anyhow<E: std::fmt::Display>(e: E) -> anyhow::Error {
    anyhow!("{e}")
}

/// Best-effort lookup of an actor's handle + display name from the public
/// Bluesky AppView (the same source atradio's own AppView uses). Returns None on
/// any failure so login never blocks on it. `actor` may be a DID or a handle.
async fn fetch_profile(actor: &str) -> Option<(Option<String>, Option<String>)> {
    #[derive(serde::Deserialize)]
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
