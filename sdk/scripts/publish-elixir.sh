#!/usr/bin/env bash
# Publish the Elixir SDK (atradio_ex) to Hex. Pure Elixir — no native build; it
# depends on the published atradio_erl (publish that FIRST with publish-erlang.sh).
#
# mix.exs depends on the Hex atradio_erl (`~> 0.1`) unless ATRADIO_ERL_PATH is
# set, so this just ensures that env is unset and runs `mix hex.publish`.
#
# Auth first: mix hex.user auth (or export HEX_API_KEY=...).
# Usage: ./publish-elixir.sh [--dry-run]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ex="$here/../elixir"
dry=0
[ "${1:-}" = "--dry-run" ] && dry=1

command -v mix >/dev/null 2>&1 || { echo "error: mix (Elixir) not found" >&2; exit 1; }

unset ATRADIO_ERL_PATH # publish against the Hex atradio_erl, not the local path dep

cd "$ex"
echo "== atradio_ex -> Hex =="
mix deps.get
if [ "$dry" -eq 1 ]; then
  echo "DRY RUN — building the tarball only (mix hex.build)"
  mix hex.build
else
  # hex.publish uploads the package + ExDoc docs; the docs re-push is idempotent.
  mix hex.publish --yes
  mix hex.publish docs --yes
fi
echo "Done."
