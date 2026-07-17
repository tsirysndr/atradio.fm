//! systemd user-service management (Linux only).
//!
//! Installs `atradio --no-tui` — the headless atradio Connect device — as a
//! `systemctl --user` service so it survives logout/reboot and restarts on
//! failure. The whole module is gated to Linux; on macOS/*BSD the `service`
//! subcommand is compiled out entirely.

use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

const SERVICE_NAME: &str = "atradio";
/// Baked into the binary; the `ExecStart=` line is rewritten at install time to
/// point at wherever this binary actually lives.
const SERVICE_TEMPLATE: &str = include_str!("atradio.service");

/// `~/.config/systemd/user` (honours `XDG_CONFIG_HOME`).
fn unit_dir() -> Result<PathBuf> {
    let base =
        directories::BaseDirs::new().context("could not determine the user config directory")?;
    Ok(base.config_dir().join("systemd").join("user"))
}

fn unit_path() -> Result<PathBuf> {
    Ok(unit_dir()?.join(format!("{SERVICE_NAME}.service")))
}

fn systemctl(args: &[&str]) -> Result<()> {
    Command::new("systemctl")
        .arg("--user")
        .args(args)
        .status()
        .context("failed to run `systemctl` — is systemd available?")?;
    Ok(())
}

pub fn install() -> Result<()> {
    let path = unit_path()?;
    if path.exists() {
        println!(
            "Service already installed at {}. Nothing to do.",
            path.display()
        );
        return Ok(());
    }

    let exe = std::env::current_exe().context("could not resolve the atradio binary path")?;
    let unit = SERVICE_TEMPLATE.replace(
        "ExecStart=/usr/local/bin/atradio --no-tui",
        &format!("ExecStart={} --no-tui", exe.display()),
    );

    std::fs::create_dir_all(unit_dir()?).context("could not create the systemd user directory")?;
    std::fs::write(&path, unit).with_context(|| format!("could not write {}", path.display()))?;

    systemctl(&["daemon-reload"])?;
    systemctl(&["enable", SERVICE_NAME])?;
    systemctl(&["start", SERVICE_NAME])?;

    println!("✓ atradio service installed and started.");
    println!("  View logs with: journalctl --user -u {SERVICE_NAME} -f");
    Ok(())
}

pub fn status() -> Result<()> {
    let path = unit_path()?;
    if !path.exists() {
        println!("atradio service is not installed. Run `atradio service install`.");
        return Ok(());
    }
    systemctl(&["status", SERVICE_NAME])
}

pub fn uninstall() -> Result<()> {
    let path = unit_path()?;
    if !path.exists() {
        println!("atradio service is not installed. Nothing to do.");
        return Ok(());
    }

    systemctl(&["stop", SERVICE_NAME])?;
    systemctl(&["disable", SERVICE_NAME])?;
    std::fs::remove_file(&path).with_context(|| format!("could not remove {}", path.display()))?;
    systemctl(&["daemon-reload"])?;

    println!("✓ atradio service uninstalled.");
    Ok(())
}
