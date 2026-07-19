# atradio-sdk

[![Crates.io](https://img.shields.io/crates/v/atradio-sdk.svg)](https://crates.io/crates/atradio-sdk)
[![Documentation](https://docs.rs/atradio-sdk/badge.svg)](https://docs.rs/atradio-sdk)
[![License](https://img.shields.io/crates/l/atradio-sdk.svg)](#license)

The official Rust SDK for [atradio.fm](https://atradio.fm) — a social
internet-radio platform on the [AT Protocol](https://atproto.com) — built on top
of [jacquard](https://crates.io/crates/jacquard).

Its shape mirrors Bluesky's [`@atproto/api`](https://github.com/bluesky-social/atproto/tree/main/packages/api):
an `AtradioAgent` wraps a jacquard session and exposes high-level convenience
verbs plus a typed namespace escape hatch; reads go through an unauthenticated
`AppView` client.

## Quickstart

```rust
use atradio_sdk::AtradioAgent;

async fn demo() -> atradio_sdk::Result<()> {
  // Log in (persists the session to disk).
  let agent = AtradioAgent::builder()
      .session_store("~/.config/atradio/session.json")
      .build()?;
  agent.login_password("alice.bsky.social", "app-password").await?;
  // or: agent.login_oauth(Some("alice.bsky.social")).await?;  // browser + loopback

  // Reads — unauthenticated, via the bundled AppView client.
  let recent = agent.appview().recent_stations(25).await?;
  let faves  = agent.appview().favorites("alice.bsky.social", 30).await?;

  // Writes — high-level verbs (implemented in a later milestone).
  // agent.favorite(&station).await?;
  // agent.comment(&station, "great stream 🎶").await?;
  Ok(())
}
```

Read-only, no auth:

```rust
let av = atradio_sdk::AppView::new("https://api.atradio.fm");
let popular = av.popular_stations(50).await?;
```

## Feature flags

| Feature   | Default | Enables                                              |
| --------- | ------- | ---------------------------------------------------- |
| `oauth`   | yes     | Browser + loopback OAuth login                       |
| `dns`     | yes     | DNS-based handle resolution                          |
| `appview` | yes     | The unauthenticated public-read `AppView` client     |

Read-only consumer:

```toml
atradio-sdk = { version = "0.1", default-features = false, features = ["appview"] }
```

## Module map

| Module       | What it is                                                        |
| ------------ | ----------------------------------------------------------------- |
| `agent`      | `AtradioAgent` — auth, session, convenience write verbs           |
| `appview`    | Unauthenticated public-read XRPC client + wire types              |
| `auth`       | `Profile`, the atradio OAuth scope set, profile lookup            |
| `error`      | `SdkError` / `Result`                                             |
| `facets`     | Comment mention/GIF facet helpers *(scaffold)*                    |
| `namespaces` | Typed record accessors — the escape hatch *(scaffold)*            |
| `lexicons`   | Generated `fm.atradio.*` bindings *(populated during migration)*  |

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or <https://opensource.org/licenses/MIT>)

at your option.
