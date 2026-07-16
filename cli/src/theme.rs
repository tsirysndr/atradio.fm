//! The atradio.fm "synthwave" palette, mirrored from the web app
//! (`apps/web/src/styles/index.css`). Despite the historical `pink`/`magenta`
//! names, the scheme is a teal/green/cyan/indigo set on a near-black bg.
//!
//! The full palette is exported for consistency even where a colour isn't yet
//! referenced by a widget.
#![allow(dead_code)]

use clap::builder::styling::{AnsiColor, Color, Style, Styles};
use ratatui::style::Color as TuiColor;

// ---- raw palette (RGB) ----------------------------------------------------

pub const BG: TuiColor = TuiColor::Rgb(0x0a, 0x0e, 0x12);
pub const SURFACE: TuiColor = TuiColor::Rgb(0x11, 0x18, 0x21);
pub const PANEL: TuiColor = TuiColor::Rgb(0x18, 0x22, 0x2d);

/// Primary — teal.
pub const TEAL: TuiColor = TuiColor::Rgb(0x00, 0xe8, 0xc6);
/// Highlight — green.
pub const GREEN: TuiColor = TuiColor::Rgb(0x64, 0xe8, 0x82);
/// Secondary — cyan.
pub const CYAN: TuiColor = TuiColor::Rgb(0x00, 0xc6, 0xe8);
/// Accent — indigo.
pub const INDIGO: TuiColor = TuiColor::Rgb(0x82, 0x64, 0xff);
/// Link — orange.
pub const ORANGE: TuiColor = TuiColor::Rgb(0xff, 0xa0, 0x64);

pub const FG: TuiColor = TuiColor::Rgb(0xe8, 0xee, 0xf4);
pub const MUTED: TuiColor = TuiColor::Rgb(0x8b, 0x98, 0xa6);
pub const DANGER: TuiColor = TuiColor::Rgb(0xff, 0x64, 0x64);

/// Faint border grey (foreground @ ~12%).
pub const BORDER: TuiColor = TuiColor::Rgb(0x2a, 0x33, 0x3d);

// ---- clap styled help -----------------------------------------------------

/// Colored, styled `--help` output matching the palette.
pub fn clap_styles() -> Styles {
    let teal = Color::Rgb(clap::builder::styling::RgbColor(0x00, 0xe8, 0xc6));
    let green = Color::Rgb(clap::builder::styling::RgbColor(0x64, 0xe8, 0x82));
    let cyan = Color::Rgb(clap::builder::styling::RgbColor(0x00, 0xc6, 0xe8));
    let orange = Color::Rgb(clap::builder::styling::RgbColor(0xff, 0xa0, 0x64));

    Styles::styled()
        .header(Style::new().bold().fg_color(Some(teal)))
        .usage(Style::new().bold().fg_color(Some(cyan)))
        .literal(Style::new().bold().fg_color(Some(green)))
        .placeholder(Style::new().fg_color(Some(orange)))
        .valid(Style::new().fg_color(Some(green)))
        .invalid(
            Style::new()
                .bold()
                .fg_color(Some(Color::Ansi(AnsiColor::Red))),
        )
        .error(
            Style::new()
                .bold()
                .fg_color(Some(Color::Ansi(AnsiColor::Red))),
        )
}
