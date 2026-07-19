# @atradio/cli

**atradio.fm in your terminal** — a TUI radio player on the AT Protocol.

```bash
npm install -g @atradio/cli
atradio
```

## What this is

`@atradio/cli` ships the prebuilt `atradio` binary. Installing it pulls in a
single per-platform package — `@atradio/cli-<platform>-<arch>` — matching your
`os`/`cpu` via npm's optional-dependency resolution. There is **no download step
and no postinstall**; the tiny launcher in this package resolves the matching
binary and execs it.

## Supported platforms

| OS    | Architecture        | Package                     |
| ----- | ------------------- | --------------------------- |
| macOS | Apple Silicon (arm64) | `@atradio/cli-darwin-arm64` |
| macOS | Intel (x64)         | `@atradio/cli-darwin-x64`   |
| Linux | arm64 (glibc)       | `@atradio/cli-linux-arm64`  |
| Linux | x64 (glibc)         | `@atradio/cli-linux-x64`    |

Linux binaries are built against glibc. On a musl host (e.g. Alpine), install a
glibc compatibility layer or [build from source][repo].

## Also available as

Homebrew, `.deb`/`.rpm`, a Nix flake, and `cargo install`. See the
[project README][repo].

[repo]: https://github.com/tsirysndr/atradio.fm
