//! [`AtradioAgent`] — the SDK's centerpiece, mirroring `@atproto/api`'s `Agent`.
//!
//! It wraps a jacquard credential/OAuth session plus a handle resolver, hides the
//! app-password-vs-OAuth branching behind a single write path, and exposes both
//! high-level convenience verbs and (via [`crate::namespaces`]) a typed escape
//! hatch. Reads go through the bundled [`AppView`].

use std::path::PathBuf;
use std::sync::Arc;

use jacquard::client::credential_session::{
    CredentialLoginOptions, CredentialResumeResult, CredentialSession,
};
use jacquard::client::{Agent, FileAuthStore};
use jacquard::common::session::SessionHint;
use jacquard::identity::JacquardResolver;

use crate::appview::{AppView, StationInfo};
use crate::auth::{atradio_scopes, fetch_profile, Profile};
use crate::error::{auth_err, Result, SdkError};

/// The handle resolver backing the agent.
type Resolver = JacquardResolver<reqwest::Client>;

/// User input for creating a custom station (`fm.atradio.station`).
#[derive(Clone, Debug, Default)]
pub struct StationDraft {
    pub name: String,
    pub stream_url: String,
    pub genre: Option<String>,
    pub homepage: Option<String>,
    pub logo: Option<String>,
}

/// The atradio.fm agent: owns credential material, a handle resolver, and a
/// read-only [`AppView`] client bound to the same platform.
#[derive(Clone)]
pub struct AtradioAgent {
    store: Arc<FileAuthStore>,
    resolver: Arc<Resolver>,
    session_path: PathBuf,
    /// Serializes authenticated operations. atproto rotates the refresh token on
    /// every refresh, so two operations refreshing at once would reuse the same
    /// token — which PDSs treat as a compromise and revoke the whole session.
    /// Holding this lock across each op keeps refreshes strictly ordered so
    /// every op sees the latest persisted token.
    auth_lock: Arc<tokio::sync::Mutex<()>>,
    appview: AppView,
}

/// Builder for [`AtradioAgent`]. Obtain via [`AtradioAgent::builder`].
pub struct AtradioAgentBuilder {
    session_path: Option<PathBuf>,
    appview: String,
}

impl Default for AtradioAgentBuilder {
    fn default() -> Self {
        Self {
            session_path: None,
            appview: crate::DEFAULT_APPVIEW.to_string(),
        }
    }
}

impl AtradioAgentBuilder {
    /// Path to the on-disk session file (jacquard `FileAuthStore`). Required.
    pub fn session_store(mut self, path: impl Into<PathBuf>) -> Self {
        self.session_path = Some(path.into());
        self
    }

    /// Override the AppView base URL (defaults to [`crate::DEFAULT_APPVIEW`]).
    pub fn appview(mut self, base: impl Into<String>) -> Self {
        self.appview = base.into();
        self
    }

    /// Finish building. Errors if no session store was configured.
    pub fn build(self) -> Result<AtradioAgent> {
        let session_path = self
            .session_path
            .ok_or_else(|| SdkError::Other("session_store path is required".into()))?;
        Ok(AtradioAgent::with_parts(session_path, self.appview))
    }
}

impl AtradioAgent {
    /// Start building an agent.
    pub fn builder() -> AtradioAgentBuilder {
        AtradioAgentBuilder::default()
    }

    /// Construct an agent against a session file, using the default AppView.
    pub fn new(session_path: impl Into<PathBuf>) -> Self {
        Self::with_parts(session_path.into(), crate::DEFAULT_APPVIEW.to_string())
    }

    /// Resume an agent from a persisted session file. Does no network I/O —
    /// the underlying session is resumed lazily on the first authenticated op.
    pub async fn resume(session_path: impl Into<PathBuf>) -> Result<Self> {
        Ok(Self::new(session_path))
    }

    fn with_parts(session_path: PathBuf, appview: String) -> Self {
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
            auth_lock: Arc::new(tokio::sync::Mutex::new(())),
            appview: AppView::new(appview),
        }
    }

    // ---- identity --------------------------------------------------------

    /// The bundled read-only AppView client.
    pub fn appview(&self) -> &AppView {
        &self.appview
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

    /// True when the stored session was created via the browser OAuth flow.
    pub fn is_oauth_session(&self) -> bool {
        self.profile().map(|p| p.is_oauth()).unwrap_or(false)
    }

    /// Log out: drop the cached session + profile.
    pub fn logout(&self) {
        Profile::clear(&self.session_path);
        let _ = std::fs::remove_file(&self.session_path);
    }

    fn is_oauth(&self) -> bool {
        self.is_oauth_session()
    }

    // ---- auth ------------------------------------------------------------

    /// Log in with an app password. Persists the session + profile.
    pub async fn login_password(&self, identifier: &str, password: &str) -> Result<Profile> {
        let session = CredentialSession::new(self.store.clone(), self.resolver.clone());
        let hint = SessionHint::from_optional_input(Some(identifier));

        let auth = match session.resume(&hint).await.map_err(auth_err)? {
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
                .map_err(auth_err)?,
        };

        let did = auth.did.to_string();
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

    /// Log in via OAuth, opening the browser to the user's PDS (loopback flow).
    /// Persists the session + profile.
    pub async fn login_oauth(&self, input: Option<&str>) -> Result<Profile> {
        use jacquard::oauth::atproto::AtprotoClientMetadata;
        use jacquard::oauth::client::OAuthClient;
        use jacquard::oauth::loopback::LoopbackConfig;
        use jacquard::oauth::types::AuthorizeOptions;

        let client_data = jacquard::oauth::session::ClientData {
            keyset: None,
            config: AtprotoClientMetadata::default_localhost(),
        };
        let store = FileAuthStore::new(self.session_path.to_string_lossy().to_string());
        let oauth = OAuthClient::new(store, client_data, reqwest::Client::new());
        let hint = SessionHint::from_optional_input(input);
        let scopes = atradio_scopes()?;

        let session = match oauth
            .resume_or_login_with_local_server(
                &hint,
                AuthorizeOptions::default().with_scopes(scopes.clone()),
                LoopbackConfig::default(),
            )
            .await
            .map_err(auth_err)?
        {
            Some(session) => session,
            None => {
                let who = input.ok_or_else(|| {
                    SdkError::Other("pass a handle, DID, or PDS URL to start OAuth login".into())
                })?;
                oauth
                    .login_with_local_server(
                        who.to_string(),
                        AuthorizeOptions::default().with_scopes(scopes),
                        LoopbackConfig::default(),
                    )
                    .await
                    .map_err(auth_err)?
            }
        };

        let agent: Agent<_> = Agent::from(session);
        // `info().1` is the OAuth *session id*, not the handle — resolve the real
        // handle (and display name) from the DID via the public API.
        let (did, _session_id) = agent
            .info()
            .await
            .ok_or_else(|| SdkError::Other("OAuth session missing identity".into()))?;
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

    /// Resume the app-password session into an agent.
    async fn credential_agent(&self) -> Result<Agent<CredentialSession<FileAuthStore, Resolver>>> {
        let session = CredentialSession::new(self.store.clone(), self.resolver.clone());
        let actor = self.actor();
        let hint = SessionHint::from_optional_input(actor.as_deref());
        match session.resume(&hint).await.map_err(auth_err)? {
            CredentialResumeResult::Resumed(_) => Ok(Agent::from(session)),
            CredentialResumeResult::LoginRequired(_) => Err(SdkError::NotAuthenticated),
        }
    }

    /// Resume a stored OAuth session (no browser). Errors if it can't be resumed
    /// (expired) so the caller can prompt a fresh sign-in.
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
        match oauth.resume_or_start_auth(&hint, opts).await.map_err(auth_err)? {
            OAuthResumeOrLogin::Resumed(session) => Ok(session),
            _ => Err(SdkError::SessionExpired),
        }
    }

    /// Mint an atproto **service-auth JWT** bound to `aud` (the AppView's DID)
    /// and `lxm` (the lexicon method) — what proves to the atradio Connect hub
    /// that a WebSocket connection genuinely belongs to this account.
    pub async fn mint_service_auth(&self, aud: &str, lxm: &str) -> Result<String> {
        let _guard = self.auth_lock.lock().await;
        use jacquard::api::com_atproto::server::get_service_auth::GetServiceAuth;
        use jacquard::types::string::Nsid;
        use jacquard_common::xrpc::XrpcClient;
        use smol_str::SmolStr;

        let nsid = Nsid::<SmolStr>::new_owned(lxm).map_err(auth_err)?;
        let exp = chrono::Utc::now().timestamp() + 60;
        let req = GetServiceAuth::<SmolStr> {
            aud: SmolStr::new(aud),
            exp: Some(exp),
            lxm: Some(nsid),
        };

        let resp = if self.is_oauth() {
            let agent = Agent::from(self.resume_oauth().await?);
            XrpcClient::send(&agent, req)
                .await
                .map_err(|e| SdkError::Auth(format!("service auth request failed: {e:?}")))?
        } else {
            let agent = self.credential_agent().await?;
            XrpcClient::send(&agent, req)
                .await
                .map_err(|e| SdkError::Auth(format!("service auth request failed: {e:?}")))?
        };
        let out = resp
            .parse::<SmolStr>()
            .map_err(|e| SdkError::Auth(format!("service auth decode: {e:?}")))?;
        Ok(out.token.to_string())
    }
}

/// Record-write convenience verbs. These are stubbed until the generated
/// `fm.atradio.*` lexicon bindings land in [`crate::lexicons`] during the CLI
/// migration — building the records requires those types. Signatures are the
/// intended final surface (see `docs/sdk-design.md`).
#[allow(unused_variables)]
impl AtradioAgent {
    /// Favorite a station (`fm.atradio.favorite`). Returns the created record URI.
    pub async fn favorite(&self, station: &StationInfo) -> Result<String> {
        todo!("write verbs land with the lexicons module (see docs/sdk-design.md)")
    }

    /// Post a comment on a station (`fm.atradio.comment`). Returns the URI.
    pub async fn comment(&self, station: &StationInfo, text: &str) -> Result<String> {
        todo!("write verbs land with the lexicons module (see docs/sdk-design.md)")
    }

    /// Create a custom station (`fm.atradio.station`). Returns the URI.
    pub async fn create_station(&self, draft: &StationDraft) -> Result<String> {
        todo!("write verbs land with the lexicons module (see docs/sdk-design.md)")
    }

    /// Update the actor's play-status singleton (`fm.atradio.actor.status`, rkey
    /// `self`) so they appear in the recently-played / listener-count feeds.
    pub async fn set_play_status(&self, station: &StationInfo) -> Result<()> {
        todo!("write verbs land with the lexicons module (see docs/sdk-design.md)")
    }

    /// Delete the actor's play-status singleton.
    pub async fn delete_play_status(&self) -> Result<()> {
        todo!("write verbs land with the lexicons module (see docs/sdk-design.md)")
    }

    /// Fetch the synced audio-settings singleton (`fm.atradio.audio.settings`,
    /// rkey `self`). Returns `None` when the user has no record yet.
    pub async fn get_audio_settings(&self) -> Result<Option<AudioSettings>> {
        todo!("write verbs land with the lexicons module (see docs/sdk-design.md)")
    }

    /// Upsert the audio-settings singleton from runtime DSP state.
    pub async fn put_audio_settings(&self, settings: &AudioSettings) -> Result<()> {
        todo!("write verbs land with the lexicons module (see docs/sdk-design.md)")
    }
}

/// Placeholder for the synced DSP/EQ state. The concrete shape moves into the
/// SDK (from the CLI's `player::dsp::AudioSettings`) during migration.
#[derive(Clone, Debug, Default)]
pub struct AudioSettings;
