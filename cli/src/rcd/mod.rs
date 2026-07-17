//! rc.d service management for FreeBSD and NetBSD.
//!
//! The *BSDs use rc.d init scripts instead of systemd. Unlike the Linux
//! `systemctl --user` service, these are **system** services: the script lives
//! in a root-owned directory and enabling/starting it needs root — so these
//! commands are meant to be run as `sudo atradio service …`.
//!
//! The mirror of this module for Linux is [`crate::systemd`]; both expose the
//! same `install`/`status`/`uninstall` surface so `cli.rs` can dispatch to
//! whichever one the target platform compiles in.

use anyhow::{Context, Result};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::Command;

const SERVICE_NAME: &str = "atradio";

/// Placeholder in the rc.d templates, rewritten to the real binary path so the
/// script launches whichever `atradio` was used to install it.
const BIN_PLACEHOLDER: &str = "%%ATRADIO_BIN%%";

#[cfg(target_os = "freebsd")]
const SCRIPT_TEMPLATE: &str = include_str!("atradio.freebsd.rc");
#[cfg(target_os = "netbsd")]
const SCRIPT_TEMPLATE: &str = include_str!("atradio.netbsd.rc");

/// Where package rc.d scripts live: `/usr/local/etc/rc.d` on FreeBSD, `/etc/rc.d`
/// on NetBSD.
fn script_path() -> PathBuf {
    #[cfg(target_os = "freebsd")]
    let dir = "/usr/local/etc/rc.d";
    #[cfg(target_os = "netbsd")]
    let dir = "/etc/rc.d";
    PathBuf::from(dir).join(SERVICE_NAME)
}

fn run(program: &str, args: &[&str]) -> Result<()> {
    Command::new(program)
        .args(args)
        .status()
        .with_context(|| format!("failed to run `{program}`"))?;
    Ok(())
}

pub fn install() -> Result<()> {
    let path = script_path();
    if path.exists() {
        println!(
            "Service already installed at {}. Nothing to do.",
            path.display()
        );
        return Ok(());
    }

    let exe = std::env::current_exe().context("could not resolve the atradio binary path")?;
    let script = SCRIPT_TEMPLATE.replace(BIN_PLACEHOLDER, &exe.display().to_string());

    // The rc.d dir is root-owned; a plain user write fails with EACCES — point
    // them at sudo rather than a bare "permission denied".
    std::fs::write(&path, script).with_context(|| {
        format!(
            "could not write {} — installing a system service needs root; try `sudo atradio service install`",
            path.display()
        )
    })?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
        .with_context(|| format!("could not make {} executable", path.display()))?;

    enable_and_start()?;

    println!("✓ atradio service installed and started.");
    Ok(())
}

pub fn status() -> Result<()> {
    let path = script_path();
    if !path.exists() {
        println!("atradio service is not installed. Run `atradio service install`.");
        return Ok(());
    }
    // The rc.d script's own `status` verb works the same on both BSDs.
    run(&path.display().to_string(), &["status"])
}

pub fn uninstall() -> Result<()> {
    let path = script_path();
    if !path.exists() {
        println!("atradio service is not installed. Nothing to do.");
        return Ok(());
    }

    // Stop before disabling so the running process is actually torn down.
    let _ = run(&path.display().to_string(), &["stop"]);
    disable()?;

    std::fs::remove_file(&path).with_context(|| {
        format!(
            "could not remove {} — try `sudo atradio service uninstall`",
            path.display()
        )
    })?;

    println!("✓ atradio service uninstalled.");
    Ok(())
}

// --- platform-specific enable/disable ---------------------------------------

#[cfg(target_os = "freebsd")]
fn enable_and_start() -> Result<()> {
    // sysrc(8) persists `atradio_enable=YES` to /etc/rc.conf.
    run("sysrc", &[&format!("{SERVICE_NAME}_enable=YES")])?;
    run("service", &[SERVICE_NAME, "start"])?;
    Ok(())
}

#[cfg(target_os = "freebsd")]
fn disable() -> Result<()> {
    // `-x` removes the variable from rc.conf entirely.
    run("sysrc", &["-x", &format!("{SERVICE_NAME}_enable")])
}

#[cfg(target_os = "netbsd")]
fn enable_and_start() -> Result<()> {
    // NetBSD has no sysrc(8); toggle rc.conf ourselves, then run the script.
    set_rc_conf_enabled(true)?;
    run(&script_path().display().to_string(), &["start"])
}

#[cfg(target_os = "netbsd")]
fn disable() -> Result<()> {
    set_rc_conf_enabled(false)
}

/// Add or remove the `atradio=YES` line in /etc/rc.conf (NetBSD).
#[cfg(target_os = "netbsd")]
fn set_rc_conf_enabled(enabled: bool) -> Result<()> {
    const RC_CONF: &str = "/etc/rc.conf";
    let existing = std::fs::read_to_string(RC_CONF).unwrap_or_default();
    let line = format!("{SERVICE_NAME}=YES");

    // Drop any prior atradio= line so we never duplicate or leave a stale value.
    let mut kept: Vec<&str> = existing
        .lines()
        .filter(|l| {
            l.trim_start() != line && !l.trim_start().starts_with(&format!("{SERVICE_NAME}="))
        })
        .collect();
    if enabled {
        kept.push(&line);
    }
    let mut out = kept.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }

    std::fs::write(RC_CONF, out).with_context(|| {
        format!("could not update {RC_CONF} — try `sudo atradio service install`")
    })?;
    Ok(())
}
