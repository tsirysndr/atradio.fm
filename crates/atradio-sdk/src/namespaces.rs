//! Typed namespace accessors — the escape hatch for records the convenience
//! verbs on [`crate::AtradioAgent`] don't cover, mirroring `@atproto/api`'s
//! `agent.app.bsky.feed.post.create(...)`.
//!
//! **Scaffold:** empty until the generated [`crate::lexicons`] bindings land.
//! The planned surface (see `docs/sdk-design.md`):
//!
//! ```ignore
//! let record = agent.station().draft().name("KEXP").stream_url(url).build();
//! let out = agent.station().create(record).await?;   // wraps jacquard create_record
//! agent.favorite_ns().delete(rkey).await?;
//! ```
//!
//! Each accessor (`station()`, `favorite_ns()`, `comment_ns()`, …) returns a
//! small typed handle whose `create` / `put` / `delete` methods forward to
//! jacquard's `Collection`-generic record operations.
