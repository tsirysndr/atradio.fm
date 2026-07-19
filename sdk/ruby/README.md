# atradio (Ruby SDK)

The official **Ruby SDK** for [atradio.fm](https://atradio.fm). It binds to the
shared Rust core (`atradio-sdk`) through the crate's plain **C ABI** using Ruby's
stdlib [`fiddle`](https://docs.ruby-lang.org/en/master/Fiddle.html) — no `ffi`
gem, no codegen. The auth / record / reconcile logic is identical to the Rust,
Go, TypeScript, and Python SDKs.

## Setup

The native library is a build artifact. Build it once, then run:

```bash
cd sdk/ruby
./build.sh                 # cargo build + copy the native lib into lib/
ruby examples/smoke.rb
```

## Interactive console (IRB)

Play with the SDK in a REPL — the `Atradio` module and `Atradio::Agent` are
loaded and ready:

```bash
bin/console                # or: rake console
```

```ruby
Atradio.recent_stations(5)
Atradio.favorite_rkey("rb:...")
```

## Usage

```ruby
require "atradio"

# Reads — unauthenticated.
Atradio.recent_stations(10).each { |s| puts s.dig("station", "name") }
Atradio.popular_stations(10)
Atradio.favorites("alice.bsky.social")

# The favorite record key matches every other atradio SDK.
Atradio.favorite_rkey("rb:...")     # 16-char hex

# Writes — app-password login (persists a session file). Stations are Hashes
# with camelCase keys (stationId, name, streamUrl, source).
agent = Atradio::Agent.login("session.json", "alice.bsky.social", "app-password")
agent.favorite("stationId" => "rb:...", "name" => "KEXP",
               "streamUrl" => "https://…", "source" => "radio-browser")
agent.set_play_status(station)
agent.close
```

## How it works

- `crates/atradio-uniffi` exposes a plain C ABI (`capi.rs`): opaque agent handle,
  JSON `{"ok"|"error"}` envelopes, `atradio_string_free`.
- `lib/atradio.rb` declares those functions with `fiddle` and marshals JSON —
  the whole binding is one file, no gem dependency beyond stdlib `fiddle`.
- `build.sh` compiles the crate and drops the native library beside the module.
