# atradio (Clojure SDK)

The official **Clojure SDK** for [atradio.fm](https://atradio.fm). It binds the
shared Rust core (`atradio-sdk`) through the crate's plain **C ABI** using the
JVM **Panama** FFM API (`java.lang.foreign`) — no JNI, no C glue. The auth /
record / reconcile logic is identical to the Rust, Go, TypeScript, Python, and
Ruby SDKs.

## Requirements

JDK **22+** (FFM is finalized there). This directory pins JDK 25 + Clojure via
`mise` (`mise.toml`), independent of the repo root's JDK 21:

```bash
cd sdk/clojure
mise trust            # once — approve the pinned toolchain
./build.sh            # cargo build + copy the native lib onto the classpath
mise exec -- clojure -M:smoke
```

## Usage

```clojure
(require '[atradio.core :as at])

;; Reads — unauthenticated.
(map #(get-in % ["station" "name"]) (at/recent-stations 10))
(at/popular-stations 10)
(at/favorites "alice.bsky.social" 50)

;; The favorite record key matches every other atradio SDK.
(at/favorite-rkey "rb:...")          ; => 16-char hex

;; Writes — app-password login (persists a session file). Stations are maps with
;; camelCase string keys.
(let [agent (at/login "session.json" "alice.bsky.social" "app-password")]
  (at/favorite agent {"stationId" "rb:..." "name" "KEXP"
                      "streamUrl" "https://…" "source" "radio-browser"})
  (at/set-play-status agent station)
  (at/agent-close agent))
```

Apps embedding the SDK should pass `--enable-native-access=ALL-UNNAMED` (see the
`:run` alias in `deps.edn`) to silence the FFM restricted-method warnings.

## How it works

- `crates/atradio-uniffi` exposes a plain C ABI (`capi.rs`) — the same one the
  Ruby SDK uses.
- `src/atradio/core.clj` binds those functions with `java.lang.foreign`
  (`Linker`/`SymbolLookup`/downcall `MethodHandle`s) and marshals JSON.
- `build.sh` compiles the crate and drops the native library into `native/`
  (on the classpath).
