# atradio

[![nix](https://github.com/tsirysndr/atradio.fm/actions/workflows/nix.yml/badge.svg)](https://github.com/tsirysndr/atradio.fm/actions/workflows/nix.yml)
[![FlakeHub](https://img.shields.io/endpoint?url=https://flakehub.com/f/tsirysndr/atradio.fm/badge)](https://flakehub.com/flake/tsirysndr/atradio.fm)
[![discord](https://img.shields.io/discord/1527379646583144560?label=discord&logo=discord&color=5865F2)](https://discord.gg/WA9hq9Tmkz)

`atradio.fm` in your terminal — a TUI radio player on the AT Protocol.

A native Rust client for [atradio.fm](https://atradio.fm): browse trending /
popular / recently-played stations, fuzzy-search the whole radio-browser
directory, play live streams with a full Rockbox DSP/equalizer chain, and —
when signed in — favorite stations, add your own, and post comments to your PDS.

![atradio](preview.png)

## Contents

- [Install](#install)
  - [npm](#npm)
- [Build (from a checkout)](#build-from-a-checkout)
- [Usage](#usage)
- [Signing in](#signing-in)
- [Keybindings (TUI)](#keybindings-tui)
- [Equalizer & DSP](#equalizer--dsp)
- [atradio Connect (remote control)](#atradio-connect-remote-control)
- [Run as a service (systemd, Linux only)](#run-as-a-service-systemd-linux-only)
- [gRPC control API](#grpc-control-api)
  - [Discovery (mDNS)](#discovery-mdns)
- [Platform notes](#platform-notes)
- [Lexicon bindings](#lexicon-bindings)

## Install

Prebuilt release tarballs, `.deb`, and `.rpm` packages are attached to every
[GitHub release](https://github.com/tsirysndr/atradio.fm/releases), named
`atradio-<version>-<os>-<arch>.tar.gz` (`macos-amd64`, `macos-aarch64`,
`linux-amd64`, `linux-aarch64`, `freebsd-amd64`, `freebsd-aarch64`,
`netbsd-amd64`, `netbsd-aarch64`) — each contains the binary, README, and
LICENSE. The BSD builds run in emulated VMs and are attached to the release
shortly after it's published (aarch64 ones can take hours).

### npm

```bash
npm install -g @atradio/cli
atradio
```

`@atradio/cli` pulls in the prebuilt binary for your platform as an optional
dependency (`@atradio/cli-<os>-<arch>`), so npm downloads only the one that
matches your `os`/`cpu` — no build step, no postinstall. Covers macOS
(arm64/x64) and Linux glibc (arm64/x64). On musl (e.g. Alpine), use another
install method below or build from source.

### macOS / Linux — Homebrew

```bash
brew install tsirysndr/tap/atradio
```

### Linux — Debian / Ubuntu

Direct `.deb`:

```bash
# amd64
curl -LO https://github.com/tsirysndr/atradio.fm/releases/latest/download/atradio_0.5.2_amd64.deb
sudo apt install ./atradio_0.5.2_amd64.deb

# arm64 (Raspberry Pi 4/5, Apple-silicon VM, …)
curl -LO https://github.com/tsirysndr/atradio.fm/releases/latest/download/atradio_0.5.2_arm64.deb
sudo apt install ./atradio_0.5.2_arm64.deb
```

Or via the Gemfury apt repo (auto-updates with `apt upgrade`):

```bash
echo "deb [trusted=yes] https://apt.fury.io/tsiry/ /" \
  | sudo tee /etc/apt/sources.list.d/tsiry.list
sudo apt update && sudo apt install atradio
```

### Linux — Fedora / RHEL / openSUSE

Direct `.rpm`:

```bash
sudo dnf install \
  https://github.com/tsirysndr/atradio.fm/releases/latest/download/atradio-0.5.2-1.x86_64.rpm
```

Or via the Gemfury dnf/yum repo:

```bash
sudo tee /etc/yum.repos.d/tsiry.repo <<'EOF'
[tsiry]
name=tsiry
baseurl=https://yum.fury.io/tsiry/
enabled=1
gpgcheck=0
EOF
sudo dnf install atradio
```

### Nix

```bash
# Optional: use the binary cache to skip building.
cachix use atradio

# One-off run:
nix run github:tsirysndr/atradio.fm

# Install into your user profile:
nix profile install github:tsirysndr/atradio.fm

# Dev shell (rust toolchain + build deps):
nix develop github:tsirysndr/atradio.fm
```

### From source (Cargo)

```bash
# Runtime/build deps: a C toolchain (for the Rockbox codecs) + ALSA on Linux.
sudo apt-get install -y build-essential pkg-config libasound2-dev   # Debian/Ubuntu

cargo install --git https://github.com/tsirysndr/atradio.fm --bin atradio
```

## Build (from a checkout)

```bash
cd cli
cargo build --release
./target/release/atradio          # launch the TUI
```

Building compiles the vendored Rockbox codecs, so a C toolchain is required
(clang/gcc). macOS uses CoreAudio; Linux needs ALSA dev headers
(`libasound2-dev`).

> **License note:** this crate links `rockbox-playback` (GPL-2.0-or-later), so
> the compiled `atradio` binary is GPL-2.0-or-later.

## Usage

```bash
atradio                       # interactive TUI (default)
atradio --no-tui              # headless Connect device (remote-controllable)
atradio --connect             # control another running atradio over its gRPC API
atradio discover              # find atradio instances on the LAN (mDNS)
atradio search lofi           # search radio-browser, print results
atradio play "jazz"           # headless: play the top hit for a query…
atradio play https://…/stream #   …or a stream URL directly
atradio trending              # trending stations from the AppView
atradio login                 # sign in with an app password (env), or:
atradio login --oauth         # sign in via the browser (OAuth)
atradio whoami                # show the signed-in account
atradio logout
atradio push                  # upload your local EQ/DSP settings to your PDS
atradio pull                  # download your EQ/DSP settings from your PDS
atradio service install       # Linux: run the headless daemon as a systemd user service
```

## Signing in

Reads to the AppView are public; **favoriting, commenting, adding stations,
appearing in recently-played, and [atradio Connect](#atradio-connect-remote-control)
require a session.** Two ways to authenticate:

- **App password** — set env vars, then `atradio login`:
  ```bash
  export ATPROTO_IDENTIFIER="you.bsky.social"
  export ATPROTO_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
  ```
  Its session stays signed in the longest and refreshes silently — **recommended
  for a long-running [headless daemon](#headless-daemon---no-tui).**
- **OAuth** — `atradio login --oauth you.bsky.social`, or press `s` in the TUI
  to open the sign-in modal, which completes the flow in your browser. Convenient
  for interactive use, but its session expires sooner than an app password, so an
  always-on daemon may need the occasional re-login.

The session + a small profile cache are stored under `~/.config/atradio/`
(also `settings.toml` for volume + DSP).

## Keybindings (TUI)

| Key             | Action                                                   |
| --------------- | -------------------------------------------------------- |
| `↑`/`↓` `j`/`k` | move selection                                           |
| `←`/`→` `Tab`   | switch home tab · adjust the DSP value (in the EQ view)   |
| `1` … `5`       | tabs: Trending / Popular / Recent / Favorites / Yours    |
| `Enter`         | play the selected station                                |
| `Space`         | play / pause · `x` stop · `m` mute · `+`/`-` volume (DSP) |
| `/`             | fuzzy station search                                     |
| `f`             | favorite the selected/current station                   |
| `A`             | add a custom station (when signed in)                    |
| `c` / `a`       | comments / add a comment (selected or playing station)   |
| `d`             | Connect: pick a device to play/control (see below)       |
| `n`             | notifications                                            |
| `p`             | your profile (with playable recently-played)             |
| `e`             | equalizer & DSP settings                                 |
| `s`             | sign in (OAuth) / sign out                               |
| `h` · `?`       | home · help                                              |
| `q` / `Esc`     | quit / close overlay                                     |

## Equalizer & DSP

Press `e` for the full Rockbox chain: a 10-band equalizer, bass/treble tone,
crossfeed, perceptual bass, Haas surround, a compressor, and channel mode /
stereo width. Changes apply live and persist to `settings.toml`.

### Syncing settings (`push` / `pull`)

When you're signed in, the whole DSP chain also **syncs to your PDS** as the
`fm.atradio.audio.settings` singleton record — the CLI's EQ bands (32 Hz–16 kHz)
now match the web build, so your EQ + DSP follow your account across the web app
and other devices. The TUI syncs automatically: on startup a signed-in session
**pulls** the record and applies it (remote wins), then **pushes** the current
chain back when you quit.

You can also sync on demand (both require [signing in](#signing-in)):

```bash
atradio push    # upload settings.toml → your fm.atradio.audio.settings record
atradio pull    # download the record → overwrite the DSP chain in settings.toml
```

> `pull` replaces the local DSP chain with the synced record (it keeps your local
> `volume`). If you have no record yet, `push` (or quitting the TUI) creates it.

## atradio Connect (remote control)

Like Spotify Connect: when signed in, every atradio client you have open — this
CLI, the web app, other terminals — shows up as a **device** on your account,
and any of them can control the selected player. Requires a session (it's keyed
to your DID and authenticated with an atproto service-auth token); logged-out
clients don't participate.

- Press **`d`** to open the device picker. Pick **This device** to play here, or
  pick another device to **control it from here** — pressing `Enter` on a station,
  `Space`, `m`, and `+`/`-` are then sent to that device instead of your local
  audio. The player bar shows a `◉ Controlling <device>` indicator with the
  remote's now-playing and volume.
- Selecting a device **transfers** playback to it (Spotify-style): what you're
  playing follows you to the device you pick; picking **This device** pulls it
  back and stops the remote.
- Your **listening status** (`fm.atradio.actor.status`) is now driven by Connect:
  it's cleared automatically once none of your devices are playing.

### Headless daemon (`--no-tui`)

```bash
atradio --no-tui              # stay online as a controllable device; Ctrl-C to stop
```

Runs with no TUI — just an online player you drive from the web app or another
client (great for a Raspberry Pi or a always-on box wired to your speakers).

> **Sign in with an app password for a daemon.** OAuth refresh tokens are
> short-lived, so an OAuth-authenticated daemon eventually drops offline and
> prints `session expired — run atradio login to reconnect` until you sign in
> again. An [app-password](#authentication-optional) session stays signed in far
> longer and refreshes on its own — set `ATPROTO_IDENTIFIER` +
> `ATPROTO_APP_PASSWORD` and run `atradio login` (no `--oauth`). See
> [Signing in](#signing-in).

The device name shown to your other clients defaults to a hostname-based label;
set a custom one in `~/.config/atradio/settings.toml`:

```toml
device_name = "Living Room"
```

### Run as a service (`systemd`, Linux only)

On Linux you can install the headless daemon as a **`systemctl --user` service**
so it starts on login and restarts on failure — ideal for a Raspberry Pi or an
always-on box. Sign in with an [app password](#signing-in) first so the daemon
stays online unattended.

```bash
atradio service install     # write the unit, enable + start it under systemctl --user
atradio service status      # show the running service (wraps `systemctl --user status`)
atradio service uninstall   # stop, disable, and remove the unit
```

`install` drops a unit at `~/.config/systemd/user/atradio.service` whose
`ExecStart` points at the current `atradio` binary running `--no-tui`, then runs
`daemon-reload`, `enable`, and `start`. Follow its logs with:

```bash
journalctl --user -u atradio -f
```

> To keep the service running after you log out (e.g. on a headless Pi), enable
> lingering once: `sudo loginctl enable-linger $USER`.

The `service` subcommand is **Linux-only** — it is compiled out entirely on
macOS, FreeBSD, NetBSD, and other platforms, where systemd isn't available.

## gRPC control API

Every atradio also exposes a small **gRPC control API** — `AtradioControl`
(package `atradio.v1`) — over a **Unix socket** by default, so you can script it
or have **one instance control another** on the same machine. Unlike
[Connect](#atradio-connect-remote-control) (account-wide, over the hub, needs a
session), this is a **local** channel and needs **no sign-in**: it drives
playback, `LoadStation`, the EQ/DSP chain, and `Favorite`, streams
now-playing state (`WatchState`), and lists the account's stations
(`ListStations` — favorites / own / recently-played).

**One instance controls another.** On startup atradio probes the socket:

- If nothing is there, it **starts the server** and plays locally.
- If another atradio already owns the socket, a TUI **connects to it and
  controls it** instead of starting a second player — `Enter` (load station),
  `Space`/`x`/`m`/`+`/`-`, the EQ view, `f` (favorite), `a` (comment), and `d`
  (the Connect **device picker** — forwarded, so you transfer playback among the
  controlled account's devices) all go to the controlled instance (favorites/
  comments post from *its* account), whose now-playing/volume/DSP it renders
  behind a `◉ Controlling remote` banner. Your
  **Favorites / Yours / Profile** tabs show the *controlled account's* lists
  (fetched over gRPC), so you can browse and play its stations; the global tabs
  (Trending/Popular/Recent) and search stay local.
- `atradio --no-tui` **always** serves and **errors on conflict** (a socket is
  already live → exit non-zero).

```bash
atradio --no-tui              # instance A: headless server (owns the socket)
atradio                       # instance B: auto-detects A and controls it
atradio --connect             # …the same, explicitly (default socket)
atradio --connect unix:/path/to/grpc.sock   # a specific socket
atradio --connect 127.0.0.1:7799 --token …  # a TCP endpoint (see below)
atradio --no-grpc             # neither serve nor connect — fully local
```

Drive it from anything that speaks gRPC — e.g. [`grpcurl`](https://github.com/fullstorydev/grpcurl)
(reflection is enabled):

```bash
SOCK="$HOME/.config/atradio/grpc.sock"   # macOS: ~/Library/Application Support/fm.atradio.atradio/grpc.sock
grpcurl -plaintext "unix:$SOCK" list
grpcurl -plaintext "unix:$SOCK" atradio.v1.AtradioControl/GetState
grpcurl -plaintext -d '{"volume":0.4}' "unix:$SOCK" atradio.v1.AtradioControl/SetVolume
```

**Settings** — configure it under `[grpc]` in `~/.config/atradio/settings.toml`:

```toml
[grpc]
enabled = true      # serve the control API (default true; --no-grpc overrides)
# socket = "…"      # override the default socket path
http    = false     # also serve gRPC over TCP (default false)
host    = "127.0.0.1"
port    = 7799      # TCP port (also settable with --grpc-port)
auth    = true      # require a token on TCP (default true; --no-grpc-auth off)
# token = "…"       # bearer token required on the TCP endpoint; auto-generated
                    # on first use and written back here
```

The Unix socket is guarded by file permissions; the **TCP endpoint requires a
bearer token** (`--token`, or `[grpc].token` — one is generated and persisted on
first use). Pass the same token with `--connect host:port --token …`.

To serve TCP with **no token**, set `auth = false` (or pass `--no-grpc-auth`).
Only do this on a trusted, loopback / firewalled network — the transport is
plaintext HTTP/2, so an unauthenticated endpoint on a reachable interface lets
anyone drive your player.

### Discovery (mDNS)

An instance serving the control API over **TCP** can advertise itself on the LAN
over **mDNS / DNS-SD** (`_atradio._tcp.local.`), so peers find it without knowing
an IP. Enable it under `[mdns]`:

```toml
[mdns]
enabled  = true        # advertise when serving TCP (default false)
# instance = "Living Room"   # advertised name (defaults to device_name)
```

Only real **LAN** addresses are advertised — docker, VM, and tunnel/VPN
interfaces (`docker0`, `br-*`, `vboxnet*`, `vmnet*`, `utun*`, `tailscale0`, …)
are filtered out, so a peer never gets an unreachable IP.

Discovery works from any instance (it doesn't need to advertise):

```bash
atradio discover                 # list atradio instances on the network
#   ● Living Room
#       192.168.1.20:7799   v0.5.2   token
atradio --connect "Living Room" --token …   # resolve the name via mDNS
atradio --connect                # no local server + one LAN peer → auto-connect
```

`discover` only ever surfaces atradio services (it browses that one service
type), never anything else on the network.

## Platform notes

- **Linux:** the player is exposed over **MPRIS** (D-Bus), so media keys and
  desktop panels / `playerctl` can see now-playing and drive play/pause/stop.

## Lexicon bindings

The typed `fm.atradio.*` records/queries now live in the **`atradio-sdk`** crate
(`crates/atradio-sdk/src/fm_atradio/` + `builder_types.rs`), along with the auth
and AppView-read clients the CLI consumes. They are **generated** from the
lexicon JSON in `packages/lexicons/lexicons/atradio` via jacquard's codegen.
Regenerate with:

```bash
cargo install jacquard-lexgen   # provides `jacquard-codegen`
bash crates/atradio-sdk/scripts/gen-lexicons.sh
```
