#!/usr/bin/env bash
# Publish the Erlang SDK to Hex. Hex auth is interactive, so this runs LOCALLY
# (not in CI) after bindings-release.yml has built + uploaded the per-triple NIF
# artifacts to the erlang-v<vsn> GitHub release.
#
# Usage:
#   ./publish-erlang.sh <tag> [dir-of-so]
#     <tag>       the release tag, e.g. erlang-v0.1.0
#     dir-of-so   dir with atradio_nif-<triple>.so (default: download from release)
#
# It writes the checksum manifest from the release artifacts, then runs
# `rebar3 hex publish` (which excludes the .so and ships only the manifest).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tag="${1:?usage: publish-erlang.sh <tag> [dir-of-so]}"
dir="${2:-}"

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag NIF artifacts → $dir"
  gh release download "$tag" --dir "$dir" --pattern 'atradio_nif-*.so'
fi

"$here/gen-erlang-manifest.sh" "$dir" "$tag"

cd "$here/../erlang"
echo "publishing to Hex (interactive)…"
rebar3 hex publish
