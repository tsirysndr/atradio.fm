# atradio_ex

[![Hex.pm](https://img.shields.io/hexpm/v/atradio_ex.svg?logo=elixir)](https://hex.pm/packages/atradio_ex)
[![Hex Docs](https://img.shields.io/badge/hex-docs-lightgreen.svg)](https://hexdocs.pm/atradio_ex/)
![Elixir](https://img.shields.io/badge/Elixir-1.15%2B-4B275F?logo=elixir&logoColor=white)
![Erlang/OTP](https://img.shields.io/badge/Erlang%2FOTP-27%2B-A90533?logo=erlang&logoColor=white)
![NIF](https://img.shields.io/badge/native-erl__nif-5C4B8A)
![License](https://img.shields.io/badge/license-MIT-blue)

The official **Elixir SDK** for [atradio.fm](https://atradio.fm). A thin wrapper
over the [`atradio_erl`](https://hex.pm/packages/atradio_erl) NIF package (the
shared Rust core) — so the auth / record / reconcile logic is identical to the
Rust, Go, TypeScript, Python, Ruby, Clojure, and Erlang SDKs. `atradio_erl`
downloads the matching native library from the GitHub release on first use, so
there's no Rust toolchain needed to use this package.

## Install

```elixir
# mix.exs
def deps do
  [{:atradio_ex, "~> 0.1"}]
end
```

Requires **OTP 27+** (for the `json` module `atradio_erl` uses).

## Usage

```elixir
# Reads — unauthenticated.
Atradio.recent_stations(10) |> Enum.map(& &1["station"]["name"])
Atradio.popular_stations(10)
Atradio.favorites("alice.bsky.social")

# The favorite record key matches every other atradio SDK.
Atradio.favorite_rkey("rb:...")   # 16-char hex

# Writes — app-password login (persists a session file). Stations are maps with
# binary keys.
agent = Atradio.login("session.json", "alice.bsky.social", "app-password")
Atradio.favorite(agent, %{
  "stationId" => "rb:...", "name" => "KEXP",
  "streamUrl" => "https://…", "source" => "radio-browser"
})
Atradio.set_play_status(agent, station)
```

The agent handle is a resource — released automatically by the BEAM GC.
