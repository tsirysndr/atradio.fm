# atradio

`atradio.fm` in your terminal — a synthwave TUI radio player on the AT Protocol.

A native Rust client for [atradio.fm](https://atradio.fm): browse trending /
popular stations, fuzzy-search the whole radio-browser directory, play live
streams with a full Rockbox DSP/equalizer chain, and — when signed in —
favorite stations and post comments to your own PDS.

## Build

```bash
cargo build --release        # from the repo root, or from cli/
./target/release/atradio      # launch the TUI
```

Building compiles the vendored Rockbox codecs, so a C toolchain is required
(clang/gcc). macOS uses CoreAudio; Linux needs ALSA dev headers.

> **License note:** this crate links `rockbox-playback` (GPL-2.0-or-later), so
> the compiled `atradio` binary is GPL-2.0-or-later.

## Usage

```bash
atradio                       # interactive TUI (default)
atradio search lofi           # search radio-browser, print results
atradio play "jazz"           # headless: play the top hit for a query…
atradio play https://…/stream #   …or a stream URL directly
atradio trending              # trending stations from the AppView
atradio login                 # sign in with an app password (env), or:
atradio login --oauth         # sign in via the browser (OAuth)
atradio whoami                # show the signed-in account
atradio logout
```

## Signing in

Reads / posts to the AppView are public; **favoriting and commenting require a
session.** Two ways to authenticate:

- **App password** — set env vars, then `atradio login`:
  ```bash
  export ATPROTO_IDENTIFIER="you.bsky.social"
  export ATPROTO_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
  ```
- **OAuth** — `atradio login --oauth you.bsky.social` opens your PDS in the
  browser.

The session + a small profile cache are stored under
`~/.config/atradio/` (also `settings.toml` for volume + DSP).

## Keybindings (TUI)

| Key | Action |
| --- | --- |
| `↑`/`↓` `j`/`k` | move selection |
| `←`/`→` `Tab` | switch list / home tab |
| `Enter` | play the selected station |
| `Space` | play / pause |
| `+` / `-` | volume up / down (or adjust the focused DSP value) |
| `m` | mute |
| `/` | fuzzy station search (fzf-style) |
| `f` | favorite the selected/current station |
| `c` / `a` | comments / add a comment |
| `n` | notifications |
| `e` | equalizer & DSP settings |
| `h` · `?` | home · help |
| `q` / `Esc` | quit / close overlay |

## Equalizer & DSP

Press `e` for the full Rockbox chain, mirroring the web app: a 10-band
equalizer, bass/treble tone, crossfeed, perceptual bass, Haas surround, a
compressor, and channel mode / stereo width. Changes apply live and persist to
`settings.toml`.

## Platform notes

- **Linux:** the player is exposed over **MPRIS** (D-Bus), so media keys and
  desktop panels / `playerctl` can see now-playing and drive play/pause/stop.

## Lexicon bindings

The typed `fm.atradio.*` records/queries in `src/fm_atradio/` and
`src/builder_types.rs` are **generated** from the lexicon JSON in
`packages/lexicons/lexicons/atradio` via jacquard's codegen. Regenerate with:

```bash
cargo install jacquard-lexgen   # provides `jacquard-codegen`
bash scripts/gen-lexicons.sh
```
