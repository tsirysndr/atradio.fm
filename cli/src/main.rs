extern crate alloc;

// --- generated from packages/lexicons/lexicons/atradio (see scripts/gen-lexicons.sh) ---
#[allow(unused_imports, dead_code, clippy::all)]
pub mod builder_types;
#[cfg(feature = "fm_atradio")]
#[allow(unused_imports, dead_code, clippy::all)]
pub mod fm_atradio;

// --- hand-written app modules ---
mod appview;
mod atproto;
mod cli;
mod config;
#[cfg(target_os = "linux")]
mod mpris;
mod player;
mod radio;
mod remote;
mod settings;
mod theme;
mod tui;

use clap::Parser;

#[tokio::main]
async fn main() {
    let args = cli::Cli::parse();
    if let Err(err) = cli::run(args).await {
        eprintln!("\x1b[31merror:\x1b[0m {err:#}");
        std::process::exit(1);
    }
}
