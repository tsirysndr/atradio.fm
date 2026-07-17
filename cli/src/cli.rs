//! Command-line surface. With no subcommand, the interactive TUI launches.

use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::appview::AppView;
use crate::atproto::Atproto;
use crate::config::Config;
use crate::radio::RadioBrowser;
use crate::theme;

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
    Login {
        /// Handle, DID, or PDS URL (optional; falls back to env / prompt).
        identifier: Option<String>,
        /// Use the browser OAuth flow instead of an app password.
        #[arg(long)]
        oauth: bool,
    },

    /// Sign out (forget the stored session).
    Logout,

    /// Show the currently signed-in account.
    Whoami,
}

pub async fn run(cli: Cli) -> Result<()> {
    let config = Config::from_env();

    match cli.command.unwrap_or(Command::Tui) {
        Command::Tui => crate::tui::run(config).await,
        Command::Search { query, limit } => cmd_search(query.join(" "), limit).await,
        Command::Play { target } => cmd_play(target.join(" "), config).await,
        Command::Trending { limit } => cmd_trending(limit, &config).await,
        Command::Login { identifier, oauth } => cmd_login(identifier, oauth, &config).await,
        Command::Logout => cmd_logout(&config),
        Command::Whoami => cmd_whoami(&config),
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

    player.play_url(&url);
    println!("Playing {url}\nPress Ctrl-C to stop.");

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

async fn cmd_login(identifier: Option<String>, oauth: bool, config: &Config) -> Result<()> {
    let at = Atproto::new(config.session_path.clone());

    let profile = if oauth {
        let hint = identifier.or_else(|| config.identifier.clone());
        at.login_oauth(hint.as_deref()).await?
    } else {
        let id = identifier
            .or_else(|| config.identifier.clone())
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "provide a handle/DID (arg or ATPROTO_IDENTIFIER), or use --oauth"
                )
            })?;
        let pw = config.app_password.clone().ok_or_else(|| {
            anyhow::anyhow!("set ATPROTO_APP_PASSWORD to sign in with an app password, or use --oauth")
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

fn cmd_whoami(config: &Config) -> Result<()> {
    let at = Atproto::new(config.session_path.clone());
    match at.profile() {
        Some(p) => {
            println!("@{}", p.handle);
            println!("  did:    {}", p.did);
            println!("  via:    {}", if p.method.is_empty() { "password" } else { &p.method });
            if let Some(pds) = p.pds {
                println!("  pds:    {pds}");
            }
        }
        None => println!("Not signed in. Run `atradio login`."),
    }
    Ok(())
}
