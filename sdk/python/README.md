# atradio (Python SDK)

The official **Python SDK** for [atradio.fm](https://atradio.fm). It's a thin
[UniFFI](https://mozilla.github.io/uniffi-rs/) binding to the shared Rust core
(`atradio-sdk`), so the auth / record / reconcile logic is byte-for-byte the same
as the Rust, Go, and TypeScript SDKs.

## Setup (uv)

The native library + generated module are build artifacts. Build them once, then
use `uv`:

```bash
cd sdk/python
./build.sh              # cargo build + uniffi-bindgen + copy the native lib
uv run examples/smoke.py
```

## Usage

```python
from atradio import AppView, Agent, favorite_rkey

# Reads — unauthenticated.
av = AppView()
for s in av.recent_stations(10):
    print(s.station.name)

# Writes — app-password login (persists a session file).
agent = Agent.login_password("session.json", "alice.bsky.social", "app-password")
agent.favorite(station)      # idempotent — deterministic record key
agent.set_play_status(station)

# The favorite record key matches every other atradio SDK.
favorite_rkey("rb:...")      # 16-char hex
```

## Layout

- `crates/atradio-uniffi` (Rust) — the UniFFI core: a sync facade over the async
  `atradio-sdk`, driving a tokio runtime.
- `build.sh` regenerates `src/atradio/atradio_uniffi.py` + the native library.
- `src/atradio/__init__.py` re-exports the generated bindings as the `atradio`
  package.
