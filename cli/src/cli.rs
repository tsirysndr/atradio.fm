//! Command-line surface. With no subcommand, the interactive TUI launches.

use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::appview::AppView;
use crate::atproto::Atproto;
use crate::config::Config;
use crate::radio::RadioBrowser;
use crate::theme;

// The `service` subcommand is compiled in only where we know how to manage a
// background service, and dispatches to the matching init-system backend:
// systemd on Linux, rc.d on FreeBSD/NetBSD. Other platforms compile it out.
#[cfg(any(target_os = "freebsd", target_os = "netbsd"))]
use crate::rcd as service_impl;
#[cfg(target_os = "linux")]
use crate::systemd as service_impl;

#[derive(Parser)]
#[command(
    name = "atradio",
    version,
    about = "atradio.fm in your terminal — a synthwave radio player on the AT Protocol",
    long_about = "atradio.fm in your terminal.\n\nRun with no arguments to open the interactive TUI. \
Credentials for posting are read from ATPROTO_IDENTIFIER and ATPROTO_APP_PASSWORD, \
or run `atradio login`.",
    styles = theme::clap_styles(),
    arg_required_else_help = false
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,

    /// Run headless as an atradio Connect device (no TUI): stay online and let
    /// the web app or other clients control playback. Waits until Ctrl-C.
    #[arg(long, global = true)]
    pub no_tui: bool,
}

#[derive(Subcommand)]
pub enum Command {
    /// Launch the interactive TUI (default when no command is given).
    Tui,

    /// Search stations on radio-browser and print the results.
    Search {
        /// Free-text query (station name).
        query: Vec<String>,
        /// Max results.
        #[arg(short, long, default_value_t = 20)]
        limit: u32,
    },

    /// Play a station stream URL directly (headless, no TUI).
    Play {
        /// A stream URL, or a radio-browser search query to play the top hit.
        target: Vec<String>,
    },

    /// Show trending / recent stations from the AppView.
    Trending {
        #[arg(short, long, default_value_t = 20)]
        limit: u32,
    },

    /// Sign in so you can favorite and comment.
    ///
    /// Defaults to an app-password login (set ATPROTO_APP_PASSWORD), which stays
    /// signed in the longest — recommended for a long-running `daemon`. Pass
    /// `--oauth` for the interactive browser flow instead.
    Login {
        /// Handle, DID, or PDS URL (optional; falls back to env / prompt).
        identifier: Option<String>,
        /// Use the browser OAuth flow instead of an app password. Convenient for
        /// interactive use, but its session expires sooner than an app password.
        #[arg(long)]
        oauth: bool,
    },

    /// Sign out (forget the stored session).
    Logout,

    /// Show the currently signed-in account.
    Whoami,

    /// Push your local audio settings (EQ + DSP chain) to your AT Protocol repo.
    ///
    /// Uploads the settings from `settings.toml` to the `fm.atradio.audio.settings`
    /// record so they sync to the web app and your other devices. Requires sign-in.
    Push,

    /// Pull your audio settings (EQ + DSP chain) from your AT Protocol repo.
    ///
    /// Downloads the `fm.atradio.audio.settings` record and writes it into your
    /// local `settings.toml`, replacing the local DSP chain. Requires sign-in.
    Pull,

    /// Manage a background service that runs atradio Connect headless.
    ///
    /// Installs `atradio --no-tui` under the platform's init system — systemd
    /// (`systemctl --user`) on Linux, rc.d on FreeBSD/NetBSD — so the device
    /// stays online across logout/reboot. Not available on macOS or elsewhere.
    #[cfg(any(target_os = "linux", target_os = "freebsd", target_os = "netbsd"))]
    Service {
        #[command(subcommand)]
        action: ServiceAction,
    },
}

/// Subcommands for `atradio service` (Linux / FreeBSD / NetBSD).
#[cfg(any(target_os = "linux", target_os = "freebsd", target_os = "netbsd"))]
#[derive(Subcommand)]
pub enum ServiceAction {
    /// Install the service and start it.
    Install,
    /// Show the service status.
    Status,
    /// Stop, disable, and remove the service.
    Uninstall,
}

pub async fn run(cli: Cli) -> Result<()> {
    let config = Config::from_env();
    let no_tui = cli.no_tui;

    match cli.command.unwrap_or(Command::Tui) {
        Command::Tui => {
            if no_tui {
                cmd_daemon(config).await
            } else {
                crate::tui::run(config).await
            }
        }
        Command::Search { query, limit } => cmd_search(query.join(" "), limit).await,
        Command::Play { target } => cmd_play(target.join(" "), config).await,
        Command::Trending { limit } => cmd_trending(limit, &config).await,
        Command::Login { identifier, oauth } => cmd_login(identifier, oauth, &config).await,
        Command::Logout => cmd_logout(&config),
        Command::Whoami => cmd_whoami(&config),
        Command::Push => cmd_push(&config).await,
        Command::Pull => cmd_pull(&config).await,
        #[cfg(any(target_os = "linux", target_os = "freebsd", target_os = "netbsd"))]
        Command::Service { action } => match action {
            ServiceAction::Install => service_impl::install(),
            ServiceAction::Status => service_impl::status(),
            ServiceAction::Uninstall => service_impl::uninstall(),
        },
    }
}

async fn cmd_search(query: String, limit: u32) -> Result<()> {
    if query.trim().is_empty() {
        anyhow::bail!("provide a search query, e.g. `atradio search lofi`");
    }
    let rb = RadioBrowser::new();
    let results = rb.search(&query, limit).await?;
    if results.is_empty() {
        println!("No stations found for “{query}”.");
        return Ok(());
    }
    for (i, s) in results.iter().enumerate() {
        let sub = s.subtitle();
        println!(
            "{:>2}. {}{}",
            i + 1,
            s.name,
            if sub.is_empty() {
                String::new()
            } else {
                format!("  ({sub})")
            }
        );
        println!("    {}", s.stream_url);
    }
    Ok(())
}

async fn cmd_trending(limit: u32, config: &Config) -> Result<()> {
    let av = AppView::new(&config.appview_url);
    let items = av.recent_stations(limit).await?;
    if items.is_empty() {
        println!("Nothing trending right now.");
        return Ok(());
    }
    for (i, v) in items.iter().enumerate() {
        println!("{:>2}. {}", i + 1, v.station.name);
    }
    Ok(())
}

async fn cmd_play(target: String, _config: Config) -> Result<()> {
    if target.trim().is_empty() {
        anyhow::bail!("provide a stream URL or search query");
    }
    // Resolve the URL: use it directly if it looks like one, else search.
    let url = if target.starts_with("http://") || target.starts_with("https://") {
        target.clone()
    } else {
        let rb = RadioBrowser::new();
        let hits = rb.search(&target, 1).await?;
        let s = hits
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("no station found for “{target}”"))?;
        println!("▶ {}", s.name);
        s.stream_url
    };

    let player = std::sync::Arc::new(crate::player::Player::new()?);

    // MPRIS (Linux): snapshots out over a watch channel, transport commands
    // back over an mpsc — the engine handle itself is !Send.
    #[cfg(target_os = "linux")]
    let (mpris_np_tx, mut mpris_cmd_rx) = {
        let (tx, rx) = tokio::sync::watch::channel(crate::player::NowPlaying::default());
        (tx, crate::mpris::spawn(rx))
    };

    // Resolve playlists (TuneIn/.pls/.m3u) into a direct stream the engine can
    // decode; source is unknown for a raw URL, so rely on the extension.
    let resolved = crate::radio::resolve_stream(&url, "").await;
    if resolved.is_hls {
        anyhow::bail!("HLS streams (.m3u8) aren't playable from the CLI yet: {url}");
    }
    player.play_url(&resolved.url);
    println!("Playing {}\nPress Ctrl-C to stop.", resolved.url);

    // Poll and print now-playing until interrupted.
    let mut last = String::new();
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let np = player.now_playing();

        #[cfg(target_os = "linux")]
        {
            let _ = mpris_np_tx.send(np.clone());
            while let Ok(cmd) = mpris_cmd_rx.try_recv() {
                use crate::player::MprisCmd;
                match cmd {
                    MprisCmd::Play => player.play(),
                    MprisCmd::Pause => player.pause(),
                    MprisCmd::PlayPause => player.toggle(),
                    MprisCmd::Stop => player.stop(),
                    MprisCmd::SetVolume(v) => player.set_volume(v),
                }
            }
        }

        if let Some(line) = np.line() {
            if line != last {
                println!("♪ {line}");
                last = line;
            }
        }
    }
}

/// Headless atradio Connect device: no TUI, just an online controllable player.
async fn cmd_daemon(config: Config) -> Result<()> {
    use std::sync::Arc;
    use std::time::Duration;

    use crate::appview::StationInfo;
    use crate::player::State as PlayState;
    use crate::remote::{RemoteCmd, RemoteConfig, RemoteEvent, StationLite, WireState};

    let atproto = Arc::new(Atproto::new(config.session_path.clone()));
    if !atproto.is_logged_in() {
        anyhow::bail!("atradio Connect requires sign-in — run `atradio login` first");
    }
    // Daemons run unattended for a long time. OAuth refresh tokens are short-
    // lived, so nudge toward an app-password session, which stays signed in far
    // longer (and refreshes silently). OAuth still works — it just may need the
    // occasional re-login.
    if atproto.is_oauth_session() {
        println!(
            "ℹ signed in via OAuth — for an unattended daemon, an app-password login \
             (`atradio login <handle>` with ATPROTO_APP_PASSWORD) lasts much longer."
        );
    }

    let settings = crate::settings::Settings::load(&config.session_path);
    let player = Arc::new(crate::player::Player::new()?);
    player.set_volume(settings.volume);
    player.apply_dsp(&settings.audio());

    let device_id = crate::remote::load_or_create_device_id(&config.session_path);
    let device_name = settings
        .device_name
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(crate::remote::default_device_name);
    let (state_tx, state_rx) = tokio::sync::watch::channel(WireState::default());
    let mut remote = crate::remote::spawn(
        RemoteConfig {
            base_url: config.appview_url.clone(),
            device_id,
            device_name: device_name.clone(),
            atproto: atproto.clone(),
        },
        state_rx,
    );

    println!("atradio Connect device “{device_name}” is online.");
    println!("Control it from the web app or another client. Press Ctrl-C to stop.");

    let mut current: Option<StationLite> = None;
    let mut ticker = tokio::time::interval(Duration::from_millis(500));
    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => break,
            Some(cmd) = remote.cmd_rx.recv() => match cmd {
                RemoteCmd::Play => player.play(),
                RemoteCmd::Pause => player.pause(),
                RemoteCmd::PlayPause => player.toggle(),
                RemoteCmd::Stop => { player.stop(); current = None; }
                RemoteCmd::SetVolume(v) => player.set_volume(v),
                RemoteCmd::ToggleMute => player.toggle_mute(),
                RemoteCmd::LoadStation(s) => {
                    let source = if s.id.starts_with("tunein:") {
                        "tunein"
                    } else if s.id.starts_with("custom:") {
                        "custom"
                    } else {
                        "radio-browser"
                    };
                    // Unwrap playlists into a direct stream before playing.
                    let resolved = crate::radio::resolve_stream(&s.url, source).await;
                    if resolved.is_hls {
                        println!("▶ {} — HLS not supported, skipping", s.name);
                        continue;
                    }
                    player.play_url(&resolved.url);
                    println!("▶ {}", s.name);
                    let station = StationInfo {
                        station_id: s.id.clone(),
                        name: s.name.clone(),
                        stream_url: s.url.clone(),
                        source: source.to_string(),
                        logo: s.favicon.clone(),
                        ..Default::default()
                    };
                    current = Some(s);
                    let at = atproto.clone();
                    tokio::spawn(async move { let _ = at.set_play_status(&station).await; });
                }
            },
            Some(evt) = remote.evt_rx.recv() => match evt {
                RemoteEvent::Status(online) => {
                    println!("{}", if online { "● connected" } else { "○ disconnected — retrying" });
                }
                RemoteEvent::Presence { cleanup, .. } => {
                    if cleanup {
                        let at = atproto.clone();
                        tokio::spawn(async move { let _ = at.delete_play_status().await; });
                    }
                }
                RemoteEvent::AuthExpired => {
                    println!(
                        "○ session expired — run `atradio login` to reconnect \
                         (an app-password login lasts longer for a daemon)"
                    );
                }
                _ => {}
            },
            _ = ticker.tick() => {
                let np = player.now_playing();
                let _ = state_tx.send(WireState {
                    playing: matches!(np.state, PlayState::Playing),
                    station: current.clone(),
                    title: np.line(),
                    volume: player.volume(),
                    muted: player.is_muted(),
                });
            }
        }
    }

    println!("\nStopping atradio Connect device.");
    Ok(())
}

async fn cmd_login(identifier: Option<String>, oauth: bool, config: &Config) -> Result<()> {
    let at = Atproto::new(config.session_path.clone());

    let profile = if oauth {
        let hint = identifier.or_else(|| config.identifier.clone());
        at.login_oauth(hint.as_deref()).await?
    } else {
        let id = identifier
            .or_else(|| config.identifier.clone())
            .ok_or_else(|| {
                anyhow::anyhow!("provide a handle/DID (arg or ATPROTO_IDENTIFIER), or use --oauth")
            })?;
        let pw = config.app_password.clone().ok_or_else(|| {
            anyhow::anyhow!(
                "set ATPROTO_APP_PASSWORD to sign in with an app password, or use --oauth"
            )
        })?;
        at.login_password(&id, &pw).await?
    };

    println!("✓ Signed in as @{} ({})", profile.handle, profile.did);
    Ok(())
}

fn cmd_logout(config: &Config) -> Result<()> {
    let at = Atproto::new(config.session_path.clone());
    if at.is_logged_in() {
        at.logout();
        println!("Signed out.");
    } else {
        println!("Not signed in.");
    }
    Ok(())
}

async fn cmd_push(config: &Config) -> Result<()> {
    let atproto = Atproto::new(config.session_path.clone());
    if !atproto.is_logged_in() {
        anyhow::bail!("pushing audio settings requires sign-in — run `atradio login` first");
    }
    let settings = crate::settings::Settings::load(&config.session_path);
    atproto.put_audio_settings(&settings.audio()).await?;
    println!("✓ Pushed your audio settings to your AT Protocol repo.");
    Ok(())
}

async fn cmd_pull(config: &Config) -> Result<()> {
    let atproto = Atproto::new(config.session_path.clone());
    if !atproto.is_logged_in() {
        anyhow::bail!("pulling audio settings requires sign-in — run `atradio login` first");
    }
    match atproto.get_audio_settings().await? {
        Some(remote) => {
            let mut settings = crate::settings::Settings::load(&config.session_path);
            // Keep the local volume; only the DSP chain lives in the record.
            settings.update_from(&remote, settings.volume);
            settings.save(&config.session_path);
            println!("✓ Pulled your audio settings into settings.toml.");
        }
        None => println!("No audio settings record found in your AT Protocol repo."),
    }
    Ok(())
}

fn cmd_whoami(config: &Config) -> Result<()> {
    let at = Atproto::new(config.session_path.clone());
    match at.profile() {
        Some(p) => {
            println!("@{}", p.handle);
            println!("  did:    {}", p.did);
            println!(
                "  via:    {}",
                if p.method.is_empty() {
                    "password"
                } else {
                    &p.method
                }
            );
            if let Some(pds) = p.pds {
                println!("  pds:    {pds}");
            }
        }
        None => println!("Not signed in. Run `atradio login`."),
    }
    Ok(())
}
