//! Rich-text facet helpers for comments (mentions, GIFs), mirroring
//! `@atproto/api`'s `RichText.detectFacets`.
//!
//! **Scaffold:** empty until the generated [`crate::lexicons`] comment facet
//! types land. The planned surface (see `docs/sdk-design.md`):
//!
//! ```ignore
//! let mentions = atradio_sdk::facets::detect_mentions(&agent, text).await?;
//! agent.comment_with_facets(&station, text, mentions, gif).await?;
//! ```
//!
//! Detection resolves `@handle` spans to DIDs (via the agent's resolver) and
//! computes grapheme-aware byte ranges, reusing the `unicode_segmentation`
//! dependency the generated code already pulls in.
