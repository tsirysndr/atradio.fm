# atradio (Erlang SDK)

The official **Erlang SDK** for [atradio.fm](https://atradio.fm). It binds the
shared Rust core (`atradio-sdk`) as a [Rustler](https://github.com/rusterlium/rustler)
NIF. The auth / record / reconcile logic is identical to the Rust, Go,
TypeScript, Python, Ruby, and Clojure SDKs.

Because the SDK's calls do network I/O — which must never block a BEAM scheduler
— every I/O NIF runs on a **dirty IO scheduler**. Results cross as JSON binaries
in `{"ok"|"error"}` envelopes, decoded with the OTP `json` module.

## Install (Hex)

Published as [`atradio_erl`](https://hex.pm/packages/atradio_erl) (the OTP app +
modules are `atradio` / `atradio_nif`). The NIF is fetched from the GitHub
release on first load — no Rust needed to use the package.

```erlang
%% rebar.config
{deps, [{atradio_erl, "~> 0.1"}]}.
```

```elixir
# mix.exs
{:atradio_erl, "~> 0.1"}
```

## Requirements

- **OTP 27+** (for the built-in `json` module).
- Rust toolchain — only to build the NIF from source (not needed to consume the
  published package).

## Setup

```bash
cd sdk/erlang
./build.sh          # cargo build the NIF + copy it to priv/ + erlc the modules
erl -pa ebin -noshell -eval 'atradio_smoke:main(), init:stop().'
```

## Usage

```erlang
%% Reads — unauthenticated.
Recent = atradio:recent_stations(10),
atradio:popular_stations(10),
atradio:favorites(<<"alice.bsky.social">>, 50),

%% The favorite record key matches every other atradio SDK.
Rk = atradio:favorite_rkey(<<"rb:...">>),   %% 16-byte binary

%% Writes — app-password login (persists a session file). Stations are maps
%% with binary camelCase keys.
Agent = atradio:login(<<"session.json">>, <<"alice.bsky.social">>, <<"app-password">>),
atradio:favorite(Agent, #{<<"stationId">> => <<"rb:...">>, <<"name">> => <<"KEXP">>,
                          <<"streamUrl">> => <<"https://…">>, <<"source">> => <<"radio-browser">>}),
atradio:set_play_status(Agent, Station).
%% The agent handle is a resource — released automatically by GC.
```

## How it works

- `crates/atradio-nif` (Rustler) wraps `atradio-sdk`; I/O nifs are
  `#[nif(schedule = "DirtyIo")]` and share one tokio runtime (`block_on`).
- `src/atradio_nif.erl` loads the native library and declares the NIF stubs;
  `src/atradio.erl` is the friendly wrapper (JSON envelopes via `json`).
- `build.sh` builds the NIF, copies it to `priv/atradio_nif.so`, and compiles
  the Erlang modules to `ebin/`.
