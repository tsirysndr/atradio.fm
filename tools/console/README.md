# tools/console

A single place to run every command in the atradio.fm monorepo, two ways:

- **Interactive REPL** — a Clojure + [rebel-readline](https://github.com/bhauman/rebel-readline)
  console where each command is a function.
- **Babashka tasks** — the same commands as fast `bb` tasks for scripting/CI.

## Setup

The toolchain (Java, Clojure, Babashka) is pinned in the root `mise.toml`:

```bash
mise install     # installs java, clojure, babashka (+ node, bun)
```

## Interactive console (rebel REPL)

From the repo root:

```bash
./console        # launches the rebel REPL with all commands preloaded
```

Then call commands as functions:

```clojure
(help)            ; list everything
(dev)             ; run every app in dev
(api-consumer)    ; run only the Jetstream consumer
(migrate)         ; apply Drizzle migrations
(gen-lexicons)    ; regenerate lexicon JSON from Pkl
(gen-icons)       ; regenerate PWA icons
```

## Babashka tasks

From `tools/console/`:

```bash
bb tasks          # list tasks
bb dev            # turbo dev
bb db:migrate     # apply migrations
bb lexicons:gen   # pkl -> lexicon JSON
bb repl           # launch the rebel REPL
```

Both frontends shell out to the underlying `bun` / `turbo` / `drizzle-kit` /
`pkl` commands from the repo root, so they stay in sync with the workspace
scripts — nothing is duplicated.
