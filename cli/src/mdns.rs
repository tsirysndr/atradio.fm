//! mDNS / DNS-SD service advertising + discovery for the gRPC control API.
//!
//! Instances that serve the control API over TCP (`[grpc].http = true`) can
//! advertise themselves as `_atradio._tcp.local.` so peers find them without
//! knowing an IP. Discovery browses that one service type, so it only ever sees
//! other atradio instances — never anything else on the network.
//!
//! `ServiceDaemon` runs its own background thread and is `Send + Sync`, so this
//! never touches the `!Send` player: broadcasting just holds a guard alive.
//!
//! mdns-sd is pinned to 0.13.x — 0.14+ pulls `socket-pktinfo`, whose unix path
//! needs Linux/macOS-only `IP_PKTINFO` and won't build on FreeBSD/NetBSD. 0.13
//! is pure-socket, so mDNS works on every supported platform.

use std::collections::HashMap;
use std::net::IpAddr;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

/// Interface name fragments that indicate a virtual / container / VM / tunnel
/// NIC whose address is not a real LAN address. Matched case-insensitively as a
/// substring, so `docker0`, `br-abc123`, `vboxnet0`, `vmnet8`, `bridge100`,
/// `veth…`, `utun3`, `tailscale0`, `zt…`, `wg0`, etc. are all skipped.
const VIRTUAL_IFACE_MARKERS: &[&str] = &[
    "docker",
    "br-",
    "veth",
    "virbr",
    "vboxnet",
    "vmnet",
    "vnic",
    "vmk",
    "bridge",
    "utun",
    "tun",
    "tap",
    "awdl",
    "llw",
    "tailscale",
    "zt",
    "wg",
    "gif",
    "stf",
    "ppp",
    "ipsec",
];

fn is_virtual_iface(name: &str) -> bool {
    let n = name.to_lowercase();
    VIRTUAL_IFACE_MARKERS.iter().any(|m| n.contains(m))
}

/// Real LAN addresses to advertise: skip loopback, link-local, down interfaces,
/// and docker/VM/tunnel NICs so peers only ever get a reachable address. IPv4
/// first. Empty if nothing qualifies (caller can fall back to auto-detect).
fn lan_addresses() -> Vec<IpAddr> {
    let Ok(ifaces) = if_addrs::get_if_addrs() else {
        return Vec::new();
    };
    let mut addrs: Vec<IpAddr> = ifaces
        .into_iter()
        .filter(|i| {
            i.is_oper_up() && !i.is_loopback() && !i.is_link_local() && !is_virtual_iface(&i.name)
        })
        .map(|i| i.ip())
        .collect();
    addrs.sort_by_key(IpAddr::is_ipv6); // IPv4 first
    addrs.dedup();
    addrs
}

/// The DNS-SD service type. Browsing this filters discovery to atradio only.
pub const SERVICE_TYPE: &str = "_atradio._tcp.local.";

/// A discovered atradio instance on the local network.
#[derive(Clone, Debug)]
pub struct Peer {
    /// Human name (the advertised instance name, e.g. "Living Room").
    pub instance: String,
    /// Reachable addresses, IPv4 first.
    pub addrs: Vec<IpAddr>,
    pub port: u16,
    /// Advertised `atradio` version, if present.
    pub version: Option<String>,
    /// Whether the TCP endpoint requires a bearer token.
    pub auth: bool,
}

impl Peer {
    /// The best `host:port` to dial (first address, IPv4 preferred).
    pub fn addr(&self) -> Option<String> {
        self.addrs.first().map(|ip| match ip {
            IpAddr::V6(v6) => format!("[{v6}]:{}", self.port),
            IpAddr::V4(v4) => format!("{v4}:{}", self.port),
        })
    }
}

/// Keeps an advertised service registered for as long as it's held; dropping it
/// unregisters (best-effort) and shuts the daemon down.
pub struct Broadcast {
    daemon: ServiceDaemon,
    fullname: String,
}

impl Drop for Broadcast {
    fn drop(&mut self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}

/// Sanitize an instance name into a valid DNS host label (lowercase, `[a-z0-9-]`).
fn host_label(instance: &str) -> String {
    let mut s: String = instance
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    s = s.trim_matches('-').to_string();
    if s.is_empty() {
        s = "atradio".to_string();
    }
    s
}

/// Advertise this instance's TCP control endpoint as `_atradio._tcp.local.`.
/// `auth` records whether a bearer token is required. Only real LAN addresses
/// are advertised (docker/VM/tunnel NICs are filtered out). Returns a guard that
/// keeps the advertisement alive.
pub fn broadcast(instance: &str, port: u16, auth: bool) -> Result<Broadcast> {
    let daemon = ServiceDaemon::new().context("failed to start the mDNS daemon")?;

    let host = format!("{}.local.", host_label(instance));
    let mut props: HashMap<String, String> = HashMap::new();
    props.insert("version".to_string(), env!("CARGO_PKG_VERSION").to_string());
    props.insert(
        "auth".to_string(),
        if auth { "required" } else { "none" }.to_string(),
    );

    // Advertise only real LAN addresses (skip docker/VM/tunnel NICs) so peers
    // never get an unreachable IP. Fall back to auto-detect if we found none.
    let lan = lan_addresses();
    let info = if lan.is_empty() {
        ServiceInfo::new(SERVICE_TYPE, instance, &host, "", port, props)
            .context("failed to build the mDNS service info")?
            .enable_addr_auto()
    } else {
        ServiceInfo::new(SERVICE_TYPE, instance, &host, &lan[..], port, props)
            .context("failed to build the mDNS service info")?
    };
    let fullname = info.get_fullname().to_string();
    daemon
        .register(info)
        .context("failed to register the mDNS service")?;

    Ok(Broadcast { daemon, fullname })
}

/// Browse `_atradio._tcp.local.` for `timeout`, returning the peers found
/// (deduplicated by instance name). Blocking — runs its own daemon thread.
pub fn discover(timeout: Duration) -> Result<Vec<Peer>> {
    let daemon = ServiceDaemon::new().context("failed to start the mDNS daemon")?;
    let receiver = daemon
        .browse(SERVICE_TYPE)
        .context("failed to browse for atradio services")?;

    let mut peers: HashMap<String, Peer> = HashMap::new();
    let deadline = Instant::now() + timeout;
    while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
        match receiver.recv_timeout(remaining) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let peer = peer_from(&info);
                peers.insert(peer.instance.clone(), peer);
            }
            Ok(_) => {}
            Err(_) => break, // timed out
        }
    }
    let _ = daemon.shutdown();

    let mut out: Vec<Peer> = peers.into_values().collect();
    out.sort_by_key(|p| p.instance.to_lowercase());
    Ok(out)
}

/// Pull the display name out of a full service name
/// (`Living Room._atradio._tcp.local.` → `Living Room`).
fn instance_name(fullname: &str) -> String {
    fullname
        .strip_suffix(&format!(".{SERVICE_TYPE}"))
        .unwrap_or(fullname)
        .to_string()
}

fn peer_from(info: &ServiceInfo) -> Peer {
    // IPv4 first so the dialed address is the most broadly reachable.
    let mut addrs: Vec<IpAddr> = info.get_addresses().iter().copied().collect();
    addrs.sort_by_key(|ip| ip.is_ipv6());
    Peer {
        instance: instance_name(info.get_fullname()),
        addrs,
        port: info.get_port(),
        version: info.get_property_val_str("version").map(|s| s.to_string()),
        auth: info.get_property_val_str("auth") == Some("required"),
    }
}
