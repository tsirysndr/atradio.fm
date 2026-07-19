# atradio_gleam

[![Package Version](https://img.shields.io/hexpm/v/atradio_gleam)](https://hex.pm/packages/atradio_gleam)
[![Hex Docs](https://img.shields.io/badge/hex-docs-ffaff3)](https://hexdocs.pm/atradio_gleam/)
![Gleam](https://img.shields.io/badge/Gleam-%E2%89%A51.0-FFAFF3?logo=gleam&logoColor=white)
![Erlang/OTP](https://img.shields.io/badge/Erlang%2FOTP-27%2B-A90533?logo=erlang&logoColor=white)
![NIF](https://img.shields.io/badge/native-erl__nif-5C4B8A)
![License](https://img.shields.io/badge/license-MIT-blue)

The official **Gleam SDK** for [atradio.fm](https://atradio.fm). Typed bindings
over the [`atradio_erl`](https://hex.pm/packages/atradio_erl) NIF package (the
shared Rust core) — so the auth / record / reconcile logic is identical to the
Rust, Go, TypeScript, Python, Ruby, Clojure, Elixir, and Erlang SDKs.
`atradio_erl` downloads the matching native library from the GitHub release on
first load; no Rust toolchain is needed to use this package. Requires **OTP 27+**.

## Install

```sh
gleam add atradio_gleam
```

## Usage

```gleam
import atradio_gleam
import gleam/io

pub fn main() {
  // Reads — unauthenticated.
  let stations = atradio_gleam.recent_stations(10)
  let _ = atradio_gleam.popular_stations(10)
  let _ = atradio_gleam.favorites("alice.bsky.social", 50)

  // The favorite record key matches every other atradio SDK.
  io.println(atradio_gleam.favorite_rkey("rb:..."))  // 16-char hex

  // Writes — app-password login (persists a session file).
  let agent =
    atradio_gleam.login("session.json", "alice.bsky.social", "app-password", "")
  let station =
    atradio_gleam.Station(
      id: "rb:...",
      name: "KEXP",
      stream_url: "https://…",
      source: "radio-browser",
    )
  atradio_gleam.favorite(agent, station)
  atradio_gleam.set_play_status(agent, station)
}
```

The `Agent` is a NIF resource freed by the BEAM GC — no explicit close.
