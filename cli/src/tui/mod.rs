//! The interactive terminal UI: an async render/event loop over ratatui.

mod dsp_rows;
mod state;
mod ui;

use std::io::{self, Stdout};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use crossterm::event::{
    DisableMouseCapture, EnableMouseCapture, Event, EventStream, KeyCode, KeyEventKind, KeyModifiers,
};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use futures::StreamExt;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use tokio::sync::mpsc;

use crate::appview::{AppView, StationInfo};
use crate::atproto::Atproto;
use crate::config::Config;
use crate::player::{Player, State as PlayState};
use crate::radio::RadioBrowser;
use state::{App, HomeTab, Overlay, View};

type Term = Terminal<CrosstermBackend<Stdout>>;

/// Background → UI messages (results of async fetches).
enum Msg {
    Trending(Vec<StationInfo>),
    Popular(Vec<StationInfo>),
    Favorites(Vec<StationInfo>),
    SearchResults { query: String, items: Vec<StationInfo> },
    Comments(Vec<crate::appview::CommentView>),
    Notifications { items: Vec<crate::appview::NotificationView>, unread: u32 },
    SignedIn(crate::atproto::Profile),
    /// The OAuth flow finished (success or failure); clear the busy state.
    OAuthDone,
    Toast(String),
}

pub fn status_glyph(state: PlayState) -> &'static str {
    match state {
        PlayState::Playing => "▶",
        PlayState::Paused => "⏸",
        PlayState::Stopped => "⏹",
    }
}

pub async fn run(config: Config) -> Result<()> {
    let atproto = Atproto::new(config.session_path.clone());
    let profile = atproto.profile();
    let logged_in = profile.is_some();
    let handle = profile.as_ref().map(|p| p.handle.clone());
    let display_name = profile.as_ref().and_then(|p| p.display_name.clone());

    let player = Arc::new(Player::new()?);
    #[cfg(target_os = "linux")]
    crate::mpris::spawn(player.clone());
    let appview = AppView::new(&config.appview_url);
    let browser = RadioBrowser::new();
    let atproto = Arc::new(atproto);

    // Load persisted settings (volume + DSP) and push them to the engine.
    let mut settings = crate::settings::Settings::load(&config.session_path);
    let mut app = App::new(logged_in, handle);
    app.display_name = display_name;
    app.did = profile.as_ref().map(|p| p.did.clone());
    app.method = profile.as_ref().map(|p| p.method.clone());
    app.pds = profile.as_ref().and_then(|p| p.pds.clone());
    // Credentials for in-TUI sign-in (press `s`).
    if let (Some(id), Some(pw)) = (config.identifier.clone(), config.app_password.clone()) {
        app.env_creds = Some((id, pw));
    }
    app.dsp = settings.audio();
    player.set_volume(settings.volume);
    player.apply_dsp(&app.dsp);

    // Set up the terminal.
    let mut term = setup_terminal()?;

    let (tx, mut rx) = mpsc::unbounded_channel::<Msg>();

    // Kick off initial loads.
    spawn_load_trending(&appview, &tx);
    spawn_load_popular(&appview, &tx);
    if let Some(actor) = atproto.actor() {
        spawn_load_favorites(&appview, &tx, actor.clone());
        spawn_load_notifications(&appview, &tx, actor);
    }

    let mut events = EventStream::new();
    let mut ticker = tokio::time::interval(Duration::from_millis(250));

    let res = loop {
        // Render.
        let np = player.now_playing();
        app.volume = player.volume();
        app.muted = player.is_muted();
        if let Err(e) = term.draw(|f| ui::draw(f, &app, &np)) {
            break Err(e.into());
        }
        if app.should_quit {
            break Ok(());
        }

        tokio::select! {
            maybe_ev = events.next() => {
                if let Some(Ok(ev)) = maybe_ev {
                    handle_event(ev, &mut app, &player, &appview, &browser, &atproto, &tx);
                }
            }
            Some(msg) = rx.recv() => {
                apply_msg(msg, &mut app);
            }
            _ = ticker.tick() => {
                app.toast.tick();
                // Fire a debounced search fetch if the query changed.
                if app.search_dirty {
                    app.search_dirty = false;
                    let q = app.search_query.clone();
                    if !q.trim().is_empty() {
                        spawn_search(&browser, &tx, q);
                    }
                }
            }
        }
    };

    // Persist volume + DSP on exit.
    settings.update_from(&app.dsp, player.volume());
    settings.save(&config.session_path);

    restore_terminal(&mut term)?;
    res
}

fn apply_msg(msg: Msg, app: &mut App) {
    match msg {
        Msg::Trending(items) => {
            app.trending = items;
            app.clamp_selection();
        }
        Msg::Popular(items) => app.popular = items,
        Msg::Favorites(items) => app.favorites = items,
        Msg::SearchResults { query, items } => {
            // Ignore stale responses.
            if query == app.search_query || app.search_query.is_empty() {
                app.search_results = items;
                app.search_selected = 0;
            }
        }
        Msg::Comments(items) => {
            app.comments = items;
            app.comments_selected = 0;
        }
        Msg::Notifications { items, unread } => {
            app.notifications = items;
            app.unread = unread;
        }
        Msg::SignedIn(p) => {
            app.logged_in = true;
            app.handle = Some(p.handle);
            app.display_name = p.display_name;
            app.did = Some(p.did);
            app.method = Some(p.method);
            app.pds = p.pds;
            app.overlay = Overlay::None;
        }
        Msg::OAuthDone => {
            app.oauth_busy = false;
            if app.overlay == Overlay::SignIn {
                app.overlay = Overlay::None;
            }
        }
        Msg::Toast(t) => app.toast.set(t),
    }
}

#[allow(clippy::too_many_arguments)]
fn handle_event(
    ev: Event,
    app: &mut App,
    player: &Arc<Player>,
    appview: &AppView,
    browser: &RadioBrowser,
    atproto: &Arc<Atproto>,
    tx: &mpsc::UnboundedSender<Msg>,
) {
    let Event::Key(key) = ev else { return };
    if key.kind == KeyEventKind::Release {
        return;
    }

    // Ctrl-C always quits.
    if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
        app.should_quit = true;
        return;
    }

    match app.overlay {
        Overlay::Search => return handle_search_keys(key.code, app, player, atproto, tx),
        Overlay::Compose => return handle_compose_keys(key.code, app, atproto, tx),
        Overlay::SignIn => return handle_signin_keys(key.code, app, appview, atproto, tx),
        Overlay::None => {}
    }

    match key.code {
        KeyCode::Char('q') => app.should_quit = true,
        KeyCode::Esc => {
            if app.view != View::Home {
                app.view = View::Home;
            } else {
                app.should_quit = true;
            }
        }
        KeyCode::Char('/') => {
            app.overlay = Overlay::Search;
            app.search_selected = 0;
        }
        KeyCode::Char('h') => app.view = View::Home,
        // Number keys jump straight to a home tab.
        KeyCode::Char('1') => {
            app.view = View::Home;
            app.home_tab = HomeTab::Trending;
            app.selected = 0;
        }
        KeyCode::Char('2') => {
            app.view = View::Home;
            app.home_tab = HomeTab::Popular;
            app.selected = 0;
        }
        KeyCode::Char('3') => {
            app.view = View::Home;
            app.home_tab = HomeTab::Favorites;
            app.selected = 0;
        }
        KeyCode::Char('e') => app.view = View::Dsp,
        KeyCode::Char('p') => app.view = View::Profile,
        KeyCode::Char('?') => app.view = View::Help,
        KeyCode::Char('n') => {
            app.view = View::Notifications;
            if let Some(actor) = atproto.actor() {
                spawn_load_notifications(appview, tx, actor.clone());
                let av = appview.clone();
                let tx2 = tx.clone();
                tokio::spawn(async move {
                    let _ = av.update_seen(&actor).await;
                    let _ = tx2; // badge clears on next reload
                });
                app.unread = 0;
            }
        }
        KeyCode::Char('c') => {
            app.view = View::Comments;
            if let Some(s) = app.current.clone() {
                spawn_load_comments(appview, tx, s.station_id);
            }
        }
        KeyCode::Char('a') => {
            if app.current.is_some() {
                app.overlay = Overlay::Compose;
                app.compose_text.clear();
            } else {
                app.toast.set("Play a station first to comment.");
            }
        }
        KeyCode::Char(' ') => {
            player.toggle();
        }
        KeyCode::Char('m') => {
            player.toggle_mute();
        }
        KeyCode::Char('+') | KeyCode::Char('=') => {
            if app.view == View::Dsp {
                if dsp_rows::adjust(&mut app.dsp, app.dsp_row, 1) {
                    player.apply_dsp(&app.dsp);
                }
            } else {
                player.bump_volume(0.05);
            }
        }
        KeyCode::Char('-') | KeyCode::Char('_') => {
            if app.view == View::Dsp {
                if dsp_rows::adjust(&mut app.dsp, app.dsp_row, -1) {
                    player.apply_dsp(&app.dsp);
                }
            } else {
                player.bump_volume(-0.05);
            }
        }
        KeyCode::Char('f') => favorite_selected(app, atproto, tx),
        KeyCode::Char('s') => toggle_signin(app, atproto),
        KeyCode::Up | KeyCode::Char('k') => move_up(app),
        KeyCode::Down | KeyCode::Char('j') => move_down(app),
        KeyCode::Left => {
            if app.view == View::Home {
                app.home_tab = app.home_tab.prev();
                app.selected = 0;
            }
        }
        KeyCode::Right | KeyCode::Tab => {
            if app.view == View::Home {
                app.home_tab = app.home_tab.next();
                app.selected = 0;
            }
        }
        KeyCode::Enter => play_selected(app, player, browser, atproto, appview, tx),
        _ => {}
    }
}

fn move_up(app: &mut App) {
    match app.view {
        View::Dsp => {
            app.dsp_row = app.dsp_row.saturating_sub(1);
        }
        View::Home => {
            app.selected = app.selected.saturating_sub(1);
        }
        _ => {}
    }
}

fn move_down(app: &mut App) {
    match app.view {
        View::Dsp => {
            if app.dsp_row + 1 < dsp_rows::row_count() {
                app.dsp_row += 1;
            }
        }
        View::Home => {
            let len = app.active_list().len();
            if len > 0 && app.selected + 1 < len {
                app.selected += 1;
            }
        }
        _ => {}
    }
}

fn play_selected(
    app: &mut App,
    player: &Arc<Player>,
    browser: &RadioBrowser,
    atproto: &Arc<Atproto>,
    _appview: &AppView,
    tx: &mpsc::UnboundedSender<Msg>,
) {
    if app.view != View::Home {
        return;
    }
    let Some(station) = app.selected_station().cloned() else {
        return;
    };
    start_playing(app, player, browser, atproto, tx, station);
}

fn start_playing(
    app: &mut App,
    player: &Arc<Player>,
    browser: &RadioBrowser,
    atproto: &Arc<Atproto>,
    tx: &mpsc::UnboundedSender<Msg>,
    station: StationInfo,
) {
    player.play_url(&station.stream_url);
    app.toast.set(format!("▶ {}", station.name));
    app.current = Some(station.clone());

    // Register the play with radio-browser (click count) and the AppView
    // (actor status → recently-played), best-effort.
    let b = browser.clone();
    let sid = station.station_id.clone();
    tokio::spawn(async move { b.register_click(&sid).await });

    if atproto.is_logged_in() {
        let at = atproto.clone();
        let s = station.clone();
        let tx2 = tx.clone();
        tokio::spawn(async move {
            if let Err(e) = at.set_play_status(&s).await {
                let _ = tx2.send(Msg::Toast(format!("play status: {e}")));
            }
        });
    }
}

/// Open the OAuth sign-in modal, or sign out when already signed in.
fn toggle_signin(app: &mut App, atproto: &Arc<Atproto>) {
    if app.logged_in {
        atproto.logout();
        app.logged_in = false;
        app.handle = None;
        app.display_name = None;
        app.did = None;
        app.method = None;
        app.pds = None;
        app.favorites.clear();
        app.notifications.clear();
        app.unread = 0;
        if app.view == View::Profile {
            app.view = View::Home;
        }
        app.toast.set("Signed out.");
        return;
    }

    // Prefill the prompt with a known identifier, if any.
    app.signin_input = app
        .env_creds
        .as_ref()
        .map(|(id, _)| id.clone())
        .unwrap_or_default();
    app.overlay = Overlay::SignIn;
}

/// Keys for the OAuth sign-in modal.
fn handle_signin_keys(
    code: KeyCode,
    app: &mut App,
    appview: &AppView,
    atproto: &Arc<Atproto>,
    tx: &mpsc::UnboundedSender<Msg>,
) {
    if app.oauth_busy {
        // Ignore edits while the browser flow is running; Esc still dismisses.
        if code == KeyCode::Esc {
            app.overlay = Overlay::None;
        }
        return;
    }
    match code {
        KeyCode::Esc => {
            app.overlay = Overlay::None;
        }
        KeyCode::Enter => {
            let input = app.signin_input.trim().to_string();
            if input.is_empty() {
                app.toast.set("Enter a handle, DID, or PDS URL.");
                return;
            }
            app.oauth_busy = true;
            app.toast.set("Opening browser to sign in…");
            let at = atproto.clone();
            let av = appview.clone();
            let tx = tx.clone();
            tokio::spawn(async move {
                match at.login_oauth(Some(&input)).await {
                    Ok(profile) => {
                        let handle = profile.handle.clone();
                        let _ = tx.send(Msg::Toast(format!("✓ Signed in as {}", profile.label())));
                        let _ = tx.send(Msg::SignedIn(profile));
                        if let Ok(out) = av.favorites(&handle, 100).await {
                            let _ = tx.send(Msg::Favorites(
                                out.items.into_iter().map(|v| v.station).collect(),
                            ));
                        }
                        if let Ok(out) = av.notifications(&handle, 50).await {
                            let _ = tx.send(Msg::Notifications {
                                items: out.items,
                                unread: out.unread_count,
                            });
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Msg::Toast(format!("sign-in failed: {e}")));
                    }
                }
                let _ = tx.send(Msg::OAuthDone);
            });
        }
        KeyCode::Backspace => {
            app.signin_input.pop();
        }
        KeyCode::Char(c) => {
            app.signin_input.push(c);
        }
        _ => {}
    }
}

fn favorite_selected(app: &mut App, atproto: &Arc<Atproto>, tx: &mpsc::UnboundedSender<Msg>) {
    let station = app
        .selected_station()
        .cloned()
        .or_else(|| app.current.clone());
    let Some(station) = station else {
        return;
    };
    if !atproto.is_logged_in() {
        app.toast.set("Sign in first: run `atradio login`.");
        return;
    }
    let at = atproto.clone();
    let tx = tx.clone();
    let name = station.name.clone();
    tokio::spawn(async move {
        let msg = match at.favorite(&station).await {
            Ok(_) => format!("★ Favorited {name}"),
            Err(e) => format!("favorite failed: {e}"),
        };
        let _ = tx.send(Msg::Toast(msg));
    });
}

fn handle_search_keys(
    code: KeyCode,
    app: &mut App,
    player: &Arc<Player>,
    atproto: &Arc<Atproto>,
    tx: &mpsc::UnboundedSender<Msg>,
) {
    match code {
        KeyCode::Esc => {
            app.overlay = Overlay::None;
        }
        KeyCode::Enter => {
            let ranked = app.ranked_search();
            if let Some((_, s)) = ranked.get(app.search_selected) {
                let station = (*s).clone();
                app.overlay = Overlay::None;
                // Reuse the play path (no browser handle here; play directly).
                player.play_url(&station.stream_url);
                app.toast.set(format!("▶ {}", station.name));
                app.current = Some(station.clone());
                if atproto.is_logged_in() {
                    let at = atproto.clone();
                    let tx2 = tx.clone();
                    tokio::spawn(async move {
                        let _ = at.set_play_status(&station).await;
                        let _ = tx2;
                    });
                }
            }
        }
        KeyCode::Up => {
            app.search_selected = app.search_selected.saturating_sub(1);
        }
        KeyCode::Down => {
            let len = app.ranked_search().len();
            if len > 0 && app.search_selected + 1 < len {
                app.search_selected += 1;
            }
        }
        KeyCode::Backspace => {
            app.search_query.pop();
            app.search_dirty = true;
        }
        KeyCode::Char(c) => {
            app.search_query.push(c);
            app.search_dirty = true;
        }
        _ => {}
    }
}

fn handle_compose_keys(
    code: KeyCode,
    app: &mut App,
    atproto: &Arc<Atproto>,
    tx: &mpsc::UnboundedSender<Msg>,
) {
    match code {
        KeyCode::Esc => {
            app.overlay = Overlay::None;
            app.compose_text.clear();
        }
        KeyCode::Enter => {
            let text = app.compose_text.trim().to_string();
            let station = app.current.clone();
            app.overlay = Overlay::None;
            app.compose_text.clear();
            if text.is_empty() {
                return;
            }
            let Some(station) = station else { return };
            if !atproto.is_logged_in() {
                app.toast.set("Sign in first: run `atradio login`.");
                return;
            }
            let at = atproto.clone();
            let tx = tx.clone();
            tokio::spawn(async move {
                let msg = match at.comment(&station, &text).await {
                    Ok(_) => "💬 Comment posted".to_string(),
                    Err(e) => format!("comment failed: {e}"),
                };
                let _ = tx.send(Msg::Toast(msg));
            });
        }
        KeyCode::Backspace => {
            app.compose_text.pop();
        }
        KeyCode::Char(c) => {
            app.compose_text.push(c);
        }
        _ => {}
    }
}

// ---- async fetch spawners ------------------------------------------------

fn spawn_load_trending(appview: &AppView, tx: &mpsc::UnboundedSender<Msg>) {
    let av = appview.clone();
    let tx = tx.clone();
    tokio::spawn(async move {
        if let Ok(items) = av.recent_stations(50).await {
            let _ = tx.send(Msg::Trending(items.into_iter().map(|v| v.station).collect()));
        }
    });
}

fn spawn_load_popular(appview: &AppView, tx: &mpsc::UnboundedSender<Msg>) {
    let av = appview.clone();
    let tx = tx.clone();
    tokio::spawn(async move {
        if let Ok(items) = av.popular_stations(50).await {
            let _ = tx.send(Msg::Popular(items.into_iter().map(|p| p.station).collect()));
        }
    });
}

fn spawn_load_favorites(appview: &AppView, tx: &mpsc::UnboundedSender<Msg>, actor: String) {
    let av = appview.clone();
    let tx = tx.clone();
    tokio::spawn(async move {
        if let Ok(out) = av.favorites(&actor, 100).await {
            let _ = tx.send(Msg::Favorites(out.items.into_iter().map(|v| v.station).collect()));
        }
    });
}

fn spawn_load_comments(appview: &AppView, tx: &mpsc::UnboundedSender<Msg>, station_id: String) {
    let av = appview.clone();
    let tx = tx.clone();
    tokio::spawn(async move {
        if let Ok(out) = av.comments(&station_id, 100).await {
            let _ = tx.send(Msg::Comments(out.items));
        }
    });
}

fn spawn_load_notifications(appview: &AppView, tx: &mpsc::UnboundedSender<Msg>, actor: String) {
    let av = appview.clone();
    let tx = tx.clone();
    tokio::spawn(async move {
        if let Ok(out) = av.notifications(&actor, 50).await {
            let _ = tx.send(Msg::Notifications {
                items: out.items,
                unread: out.unread_count,
            });
        }
    });
}

fn spawn_search(browser: &RadioBrowser, tx: &mpsc::UnboundedSender<Msg>, query: String) {
    let b = browser.clone();
    let tx = tx.clone();
    tokio::spawn(async move {
        if let Ok(items) = b.search(&query, 40).await {
            let _ = tx.send(Msg::SearchResults { query, items });
        }
    });
}

// ---- terminal setup / teardown -------------------------------------------

fn setup_terminal() -> Result<Term> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut term = Terminal::new(backend)?;
    term.clear()?;
    Ok(term)
}

fn restore_terminal(term: &mut Term) -> Result<()> {
    disable_raw_mode()?;
    execute!(term.backend_mut(), LeaveAlternateScreen, DisableMouseCapture)?;
    term.show_cursor()?;
    Ok(())
}
