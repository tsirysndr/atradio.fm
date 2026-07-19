# atradio-go

The official **Go SDK** for [atradio.fm](https://atradio.fm), built on the
Bluesky [indigo](https://github.com/bluesky-social/indigo) SDK (`xrpc.Client`).
It mirrors the Rust and TypeScript SDKs: an `Agent` with high-level record verbs
plus a read-only `AppView` client.

```go
import "github.com/tsirysndr/atradio.fm/sdk/go"
```

## Usage

```go
ctx := context.Background()

agent, err := atradio.Login(ctx, atradio.LoginOptions{
    Identifier: "alice.bsky.social",
    Password:   "app-password",
})
if err != nil { log.Fatal(err) }

station := atradio.StationInfo{
    StationID: "rb:...", Name: "KEXP",
    StreamURL: "https://kexp.streamguys1.com/kexp160.aac", Source: "radio-browser",
}

uri, _ := agent.Favorite(ctx, station)   // idempotent — deterministic record key
_, _ = agent.Comment(ctx, station, "great stream 🎶")
_ = agent.SetPlayStatus(ctx, station)

// Reads (also usable standalone via atradio.NewAppView).
recent, _ := agent.AppView.RecentStations(ctx, 25)
```

Keep the session alive over a long-running process:

```go
go func() {
    t := time.NewTicker(30 * time.Minute)
    for { _ = agent.RefreshSession(ctx); <-t.C }
}()
```

## What it gives you

- **Auth:** `Login` (app-password via `com.atproto.server.createSession`) or
  `FromClient` to wrap an existing indigo `xrpc.Client`. `RefreshSession`
  keep-alive (uses the refresh token, persists the rotation, serialized).
- **Writes:** `Favorite` / `Unfavorite` (idempotent, deterministic record key —
  identical to the Rust and TypeScript SDKs, so a station maps to one favorite
  everywhere, with old-key reconcile), `Comment`, `CreateStation`,
  `Set/DeletePlayStatus`, `Get/PutAudioSettings`, `MintServiceAuth`.
- **Reads:** `agent.AppView` (or a standalone `AppView`) over the public
  `fm.atradio.*` XRPC.

Custom `fm.atradio.*` records are sent as JSON over `xrpc.Client.Do`, so there's
no CBOR/lexgen step.
