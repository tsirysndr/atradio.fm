//! Rendering. Synthwave palette, laid out to echo the web app: a top bar, the
//! active view, a persistent player bar, and a footer of keybindings.

use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Clear, Gauge, Paragraph};
use ratatui::Frame;

use super::dsp_rows;
use super::state::{App, HomeTab, Overlay, View};
use crate::appview::StationInfo;
use crate::player::NowPlaying;
use crate::theme;

pub fn draw(f: &mut Frame, app: &App, np: &NowPlaying) {
    let root = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // top bar
            Constraint::Min(3),    // content
            Constraint::Length(4), // player bar
            Constraint::Length(1), // footer
        ])
        .split(f.area());

    // Background fill.
    f.render_widget(Block::default().style(Style::default().bg(theme::BG)), f.area());

    draw_topbar(f, root[0], app);
    match app.view {
        View::Home => draw_home(f, root[1], app),
        View::Dsp => draw_dsp(f, root[1], app),
        View::Comments => draw_comments(f, root[1], app),
        View::Notifications => draw_notifications(f, root[1], app),
        View::Profile => draw_profile(f, root[1], app),
        View::Help => draw_help(f, root[1]),
    }
    draw_player(f, root[2], app, np);
    draw_footer(f, root[3], app);

    match app.overlay {
        Overlay::Search => draw_search(f, f.area(), app),
        Overlay::Compose => draw_compose(f, f.area(), app),
        Overlay::None => {}
    }
}

fn draw_topbar(f: &mut Frame, area: Rect, app: &App) {
    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(10), Constraint::Length(40)])
        .split(area);

    let brand = Line::from(vec![
        Span::styled("atradio", Style::default().fg(theme::TEAL).add_modifier(Modifier::BOLD)),
        Span::styled(".fm", Style::default().fg(theme::CYAN).add_modifier(Modifier::BOLD)),
        Span::styled("  ·  social radio in your terminal", Style::default().fg(theme::MUTED)),
    ]);
    f.render_widget(
        Paragraph::new(brand).style(Style::default().bg(theme::SURFACE)),
        cols[0],
    );

    let who = match app.user_label() {
        Some(label) => Line::from(vec![
            bell(app.unread),
            Span::styled(format!(" {} ", truncate(&label, 34)), Style::default().fg(theme::GREEN)),
        ]),
        None => Line::from(vec![
            bell(app.unread),
            Span::styled(" guest · s to sign in ", Style::default().fg(theme::MUTED)),
        ]),
    };
    f.render_widget(
        Paragraph::new(who)
            .alignment(Alignment::Right)
            .style(Style::default().bg(theme::SURFACE)),
        cols[1],
    );
}

fn bell(unread: u32) -> Span<'static> {
    if unread > 0 {
        Span::styled(
            format!("🔔{unread}"),
            Style::default().fg(theme::ORANGE).add_modifier(Modifier::BOLD),
        )
    } else {
        Span::styled("🔔", Style::default().fg(theme::MUTED))
    }
}

fn panel(title: &str, focused: bool) -> Block<'_> {
    let border = if focused { theme::TEAL } else { theme::BORDER };
    Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(border))
        .title(Span::styled(
            format!(" {title} "),
            Style::default().fg(if focused { theme::TEAL } else { theme::MUTED }),
        ))
        .style(Style::default().bg(theme::BG))
}

fn draw_home(f: &mut Frame, area: Rect, app: &App) {
    // Tabs row + list.
    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(1), Constraint::Min(3)])
        .split(area);

    // Tabs (numbered 1–3 for quick jumps).
    let mut spans: Vec<Span> = Vec::new();
    for (i, t) in HomeTab::all().into_iter().enumerate() {
        let active = t == app.home_tab;
        let style = if active {
            Style::default().fg(theme::BG).bg(theme::TEAL).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(theme::MUTED)
        };
        spans.push(Span::styled(format!(" {} {} ", i + 1, t.label()), style));
        spans.push(Span::raw(" "));
    }
    f.render_widget(Paragraph::new(Line::from(spans)), rows[0]);

    let list = app.active_list();
    let block = panel(app.home_tab.label(), true);
    let inner = block.inner(rows[1]);
    f.render_widget(block, rows[1]);

    if list.is_empty() {
        let msg = match app.home_tab {
            HomeTab::Favorites if !app.logged_in => {
                "Sign in to see your favorites (run `atradio login`)."
            }
            HomeTab::Favorites => "No favorites yet. Press f on a station to favorite it.",
            _ => "Loading…",
        };
        f.render_widget(
            Paragraph::new(msg).style(Style::default().fg(theme::MUTED)),
            inner,
        );
        return;
    }
    render_station_list(f, inner, list, app.selected, app.current.as_ref());
}

fn render_station_list(
    f: &mut Frame,
    area: Rect,
    list: &[StationInfo],
    selected: usize,
    current: Option<&StationInfo>,
) {
    let height = area.height as usize;
    let start = selected.saturating_sub(height.saturating_sub(1));
    let mut lines: Vec<Line> = Vec::new();
    for (i, s) in list.iter().enumerate().skip(start).take(height) {
        let is_sel = i == selected;
        let is_cur = current.map(|c| c.station_id == s.station_id).unwrap_or(false);
        let marker = if is_cur { "♪ " } else if is_sel { "› " } else { "  " };
        let name_style = if is_sel {
            Style::default().fg(theme::BG).bg(theme::TEAL).add_modifier(Modifier::BOLD)
        } else if is_cur {
            Style::default().fg(theme::GREEN)
        } else {
            Style::default().fg(theme::FG)
        };
        let sub = s.subtitle();
        let mut spans = vec![
            Span::styled(marker, Style::default().fg(theme::CYAN)),
            Span::styled(truncate(&s.name, 40), name_style),
        ];
        if !sub.is_empty() {
            spans.push(Span::styled(format!("  {sub}"), Style::default().fg(theme::MUTED)));
        }
        lines.push(Line::from(spans));
    }
    f.render_widget(Paragraph::new(lines), area);
}

fn draw_dsp(f: &mut Frame, area: Rect, app: &App) {
    let block = panel("Equalizer & DSP", true);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let rows = dsp_rows::rows(&app.dsp);
    let height = inner.height as usize;
    let start = app.dsp_row.saturating_sub(height.saturating_sub(1));

    let mut y = inner.y;
    for (i, row) in rows.iter().enumerate().skip(start).take(height) {
        let is_sel = i == app.dsp_row;
        let line_area = Rect::new(inner.x, y, inner.width, 1);
        y += 1;

        let label_w = 18u16.min(inner.width);
        let label_style = if is_sel {
            Style::default().fg(theme::TEAL).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(theme::FG)
        };
        let label_area = Rect::new(line_area.x, line_area.y, label_w, 1);
        f.render_widget(
            Paragraph::new(Line::from(vec![
                Span::styled(if is_sel { "› " } else { "  " }, Style::default().fg(theme::CYAN)),
                Span::styled(truncate(&row.label, label_w as usize - 2), label_style),
            ])),
            label_area,
        );

        let rest = Rect::new(
            line_area.x + label_w,
            line_area.y,
            line_area.width.saturating_sub(label_w),
            1,
        );
        match row.fill {
            Some(fill) => {
                let bar_w = rest.width.saturating_sub(9);
                let bar_area = Rect::new(rest.x, rest.y, bar_w, 1);
                let g = Gauge::default()
                    .gauge_style(Style::default().fg(if is_sel { theme::TEAL } else { theme::INDIGO }))
                    .ratio(fill as f64)
                    .label("");
                f.render_widget(g, bar_area);
                let val_area = Rect::new(rest.x + bar_w, rest.y, rest.width.saturating_sub(bar_w), 1);
                f.render_widget(
                    Paragraph::new(Span::styled(
                        format!(" {}", row.value),
                        Style::default().fg(theme::MUTED),
                    )),
                    val_area,
                );
            }
            None => {
                let style = Style::default()
                    .fg(if row.value == "Off" { theme::MUTED } else { theme::GREEN });
                f.render_widget(Paragraph::new(Span::styled(row.value.clone(), style)), rest);
            }
        }
    }
}

fn draw_comments(f: &mut Frame, area: Rect, app: &App) {
    let title = app
        .current
        .as_ref()
        .map(|s| format!("Comments · {}", s.name))
        .unwrap_or_else(|| "Comments".into());
    let block = panel(&title, true);
    let inner = block.inner(area);
    f.render_widget(block, area);

    if app.current.is_none() {
        f.render_widget(
            Paragraph::new("Play a station first, then press c to see its comments.")
                .style(Style::default().fg(theme::MUTED)),
            inner,
        );
        return;
    }
    if app.comments.is_empty() {
        f.render_widget(
            Paragraph::new("No comments yet. Press a to add one.")
                .style(Style::default().fg(theme::MUTED)),
            inner,
        );
        return;
    }
    let mut lines: Vec<Line> = Vec::new();
    for c in &app.comments {
        let who = c
            .author
            .as_ref()
            .map(|a| a.name())
            .unwrap_or_else(|| "someone".into());
        lines.push(Line::from(vec![
            Span::styled(format!("{who} "), Style::default().fg(theme::CYAN).add_modifier(Modifier::BOLD)),
            Span::styled(c.text.clone(), Style::default().fg(theme::FG)),
        ]));
    }
    f.render_widget(Paragraph::new(lines), inner);
}

fn draw_notifications(f: &mut Frame, area: Rect, app: &App) {
    let block = panel("Notifications", true);
    let inner = block.inner(area);
    f.render_widget(block, area);

    if app.notifications.is_empty() {
        // Match the web app's empty copy, centered.
        let msg = "Nothing yet. Mentions and comments on your stations show up here.";
        let vy = inner.y + inner.height / 2;
        let line_area = Rect::new(inner.x, vy, inner.width, 1);
        f.render_widget(
            Paragraph::new(msg)
                .alignment(Alignment::Center)
                .style(Style::default().fg(theme::MUTED)),
            line_area,
        );
        return;
    }
    let mut lines: Vec<Line> = Vec::new();
    for n in &app.notifications {
        let verb = if n.reason == "mention" { "mentioned you" } else { "commented on your station" };
        let dot = if n.is_read { "  " } else { "• " };
        lines.push(Line::from(vec![
            Span::styled(dot, Style::default().fg(theme::ORANGE)),
            Span::styled(format!("{} ", n.author.name()), Style::default().fg(theme::GREEN).add_modifier(Modifier::BOLD)),
            Span::styled(verb, Style::default().fg(theme::FG)),
        ]));
        if let Some(t) = &n.text {
            lines.push(Line::from(Span::styled(
                format!("    {}", truncate(t, inner.width as usize - 4)),
                Style::default().fg(theme::MUTED),
            )));
        }
    }
    f.render_widget(Paragraph::new(lines), inner);
}

fn draw_profile(f: &mut Frame, area: Rect, app: &App) {
    let block = panel("Profile", true);
    let inner = block.inner(area);
    f.render_widget(block, area);

    if !app.logged_in {
        let msg = "Not signed in. Press s to sign in (set ATPROTO_IDENTIFIER + ATPROTO_APP_PASSWORD, or run `atradio login --oauth`).";
        f.render_widget(
            Paragraph::new(msg)
                .wrap(ratatui::widgets::Wrap { trim: true })
                .style(Style::default().fg(theme::MUTED)),
            inner,
        );
        return;
    }

    let mut lines: Vec<Line> = Vec::new();

    // Big display name + handle header.
    if let Some(name) = app.display_name.as_deref().filter(|d| !d.trim().is_empty()) {
        lines.push(Line::from(Span::styled(
            name.to_string(),
            Style::default().fg(theme::FG).add_modifier(Modifier::BOLD),
        )));
    }
    if let Some(h) = &app.handle {
        lines.push(Line::from(Span::styled(
            format!("@{h}"),
            Style::default().fg(theme::GREEN),
        )));
    }
    lines.push(Line::from(""));

    let mut field = |label: &str, value: &str| {
        lines.push(Line::from(vec![
            Span::styled(format!("  {label:<10}"), Style::default().fg(theme::MUTED)),
            Span::styled(value.to_string(), Style::default().fg(theme::FG)),
        ]));
    };
    if let Some(did) = &app.did {
        field("DID", did);
    }
    if let Some(m) = &app.method {
        field("Signed in", if m.is_empty() { "password" } else { m });
    }
    if let Some(pds) = &app.pds {
        field("PDS", pds);
    }
    field("Favorites", &app.favorites.len().to_string());
    if let Some(cur) = &app.current {
        field("Listening", &cur.name);
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  Press s to sign out.",
        Style::default().fg(theme::MUTED),
    )));

    f.render_widget(Paragraph::new(lines), inner);
}

fn draw_help(f: &mut Frame, area: Rect) {
    let block = panel("Keybindings", true);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let keys = [
        ("↑/↓ j/k", "move selection"),
        ("←/→ Tab", "switch home tab"),
        ("1 / 2 / 3", "jump to Trending / Popular / Favorites"),
        ("Enter", "play selected station"),
        ("Space", "play / pause"),
        ("+/-", "volume up / down   (or adjust DSP value)"),
        ("m", "mute"),
        ("/", "fuzzy station search"),
        ("f", "favorite the selected/current station"),
        ("c", "comments for the current station"),
        ("a", "add a comment"),
        ("n", "notifications"),
        ("e", "equalizer & DSP settings"),
        ("p", "your profile"),
        ("s", "sign in / sign out"),
        ("h", "home"),
        ("?", "this help"),
        ("q / Esc", "quit / close overlay"),
    ];
    let mut lines: Vec<Line> = Vec::new();
    for (k, d) in keys {
        lines.push(Line::from(vec![
            Span::styled(format!("  {k:<10}"), Style::default().fg(theme::TEAL).add_modifier(Modifier::BOLD)),
            Span::styled(d, Style::default().fg(theme::FG)),
        ]));
    }
    f.render_widget(Paragraph::new(lines), inner);
}

fn draw_player(f: &mut Frame, area: Rect, app: &App, np: &NowPlaying) {
    let block = Block::default()
        .borders(Borders::TOP)
        .border_style(Style::default().fg(theme::BORDER))
        .style(Style::default().bg(theme::SURFACE));
    let inner = block.inner(area);
    f.render_widget(block, area);

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(1), Constraint::Length(1), Constraint::Length(1)])
        .split(inner);

    match &app.current {
        Some(s) => {
            let state = crate::tui::status_glyph(np.state);
            f.render_widget(
                Paragraph::new(Line::from(vec![
                    Span::styled(format!("{state} "), Style::default().fg(theme::GREEN)),
                    Span::styled(truncate(&s.name, 48), Style::default().fg(theme::FG).add_modifier(Modifier::BOLD)),
                    Span::styled(format!("   {}", s.subtitle()), Style::default().fg(theme::MUTED)),
                ])),
                rows[0],
            );
            let now = np.line().unwrap_or_else(|| "—".into());
            let mut spans = vec![
                Span::styled("♪ ", Style::default().fg(theme::CYAN)),
                Span::styled(truncate(&now, 48), Style::default().fg(theme::CYAN)),
            ];
            let fmt = np.format_line();
            if !fmt.is_empty() {
                spans.push(Span::styled(
                    format!("   [{fmt}]"),
                    Style::default().fg(theme::INDIGO),
                ));
            }
            f.render_widget(Paragraph::new(Line::from(spans)), rows[1]);
        }
        None => {
            f.render_widget(
                Paragraph::new("Nothing playing — press Enter on a station, or / to search.")
                    .style(Style::default().fg(theme::MUTED)),
                rows[0],
            );
        }
    }

    // Volume line.
    let vol = (app.volume_pct()).min(100);
    let muted = app.muted;
    let vol_label = if muted { "muted".to_string() } else { format!("{vol}%") };
    f.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled("vol ", Style::default().fg(theme::MUTED)),
            Span::styled(volume_bar(vol), Style::default().fg(if muted { theme::MUTED } else { theme::TEAL })),
            Span::styled(format!(" {vol_label}"), Style::default().fg(theme::MUTED)),
        ])),
        rows[2],
    );
}

fn draw_footer(f: &mut Frame, area: Rect, app: &App) {
    if app.toast.ttl > 0 && !app.toast.text.is_empty() {
        f.render_widget(
            Paragraph::new(Span::styled(
                format!("  {}", app.toast.text),
                Style::default().fg(theme::GREEN),
            ))
            .style(Style::default().bg(theme::BG)),
            area,
        );
        return;
    }
    let hint = "  1/2/3=tabs  /=search  e=eq  c=comments  n=notifs  p=profile  f=fav  s=sign in/out  Space=play/pause  ?=help  q=quit";
    f.render_widget(
        Paragraph::new(Span::styled(hint, Style::default().fg(theme::MUTED)))
            .style(Style::default().bg(theme::BG)),
        area,
    );
}

fn draw_search(f: &mut Frame, area: Rect, app: &App) {
    let popup = centered(area, 70, 60);
    f.render_widget(Clear, popup);
    let block = panel("Search stations  (fuzzy)", true);
    let inner = block.inner(popup);
    f.render_widget(block, popup);

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(1), Constraint::Length(1), Constraint::Min(1)])
        .split(inner);

    f.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled("/ ", Style::default().fg(theme::TEAL).add_modifier(Modifier::BOLD)),
            Span::styled(&app.search_query, Style::default().fg(theme::FG)),
            Span::styled("█", Style::default().fg(theme::TEAL)),
        ])),
        rows[0],
    );
    f.render_widget(
        Paragraph::new(Span::styled(
            "type to filter · ↑↓ to move · Enter to play · Esc to close",
            Style::default().fg(theme::MUTED),
        )),
        rows[1],
    );

    let ranked = app.ranked_search();
    let height = rows[2].height as usize;
    let start = app.search_selected.saturating_sub(height.saturating_sub(1));
    let mut lines: Vec<Line> = Vec::new();
    for (i, (_, s)) in ranked.iter().enumerate().skip(start).take(height) {
        let is_sel = i == app.search_selected;
        let style = if is_sel {
            Style::default().fg(theme::BG).bg(theme::TEAL).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(theme::FG)
        };
        let sub = s.subtitle();
        let mut spans = vec![
            Span::styled(if is_sel { "› " } else { "  " }, Style::default().fg(theme::CYAN)),
            Span::styled(truncate(&s.name, 44), style),
        ];
        if !sub.is_empty() {
            spans.push(Span::styled(format!("  {sub}"), Style::default().fg(theme::MUTED)));
        }
        lines.push(Line::from(spans));
    }
    if lines.is_empty() {
        lines.push(Line::from(Span::styled(
            "  no matches",
            Style::default().fg(theme::MUTED),
        )));
    }
    f.render_widget(Paragraph::new(lines), rows[2]);
}

fn draw_compose(f: &mut Frame, area: Rect, app: &App) {
    let popup = centered(area, 60, 30);
    f.render_widget(Clear, popup);
    let title = app
        .current
        .as_ref()
        .map(|s| format!("Comment on {}", s.name))
        .unwrap_or_else(|| "Comment".into());
    let block = panel(&title, true);
    let inner = block.inner(popup);
    f.render_widget(block, popup);

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(1), Constraint::Length(1)])
        .split(inner);
    f.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(&app.compose_text, Style::default().fg(theme::FG)),
            Span::styled("█", Style::default().fg(theme::TEAL)),
        ]))
        .wrap(ratatui::widgets::Wrap { trim: false }),
        rows[0],
    );
    f.render_widget(
        Paragraph::new(Span::styled(
            "Enter to post · Esc to cancel",
            Style::default().fg(theme::MUTED),
        )),
        rows[1],
    );
}

// ---- helpers -------------------------------------------------------------

fn centered(area: Rect, pct_w: u16, pct_h: u16) -> Rect {
    let w = area.width * pct_w / 100;
    let h = area.height * pct_h / 100;
    let x = area.x + (area.width - w) / 2;
    let y = area.y + (area.height - h) / 2;
    Rect::new(x, y, w, h)
}

fn volume_bar(pct: u16) -> String {
    let filled = (pct as usize * 16 / 100).min(16);
    let mut s = String::new();
    for i in 0..16 {
        s.push(if i < filled { '▮' } else { '▯' });
    }
    s
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
        out.push('…');
        out
    }
}
