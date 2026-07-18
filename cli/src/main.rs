extern crate alloc;

// The generated fm.atradio.* lexicon bindings now live in the atradio-sdk crate;
// re-export them so the existing `crate::fm_atradio::…` paths keep resolving.
pub use atradio_sdk::fm_atradio;

// --- hand-written app modules ---
mod appview;
mod atproto;
mod cli;
mod config;
mod grpc;
mod mdns;
#[cfg(target_os = "linux")]
mod mpris;
mod player;
mod radio;
#[cfg(any(target_os = "freebsd", target_os = "netbsd"))]
mod rcd;
mod remote;
mod settings;
#[cfg(target_os = "linux")]
mod systemd;
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
