#!/usr/bin/env bash
# Publish the Clojure SDK to Clojars. Runs LOCALLY after bindings-release.yml has
# built + uploaded the per-triple uniffi libraries to the bindings-v<vsn> GitHub
# release.
#
# The jar ships no native lib: this fills resources/atradio/manifest.json from the
# release artifacts, then builds + deploys the jar (fm.atradio/sdk). The native
# lib is fetched on first load (see sdk/clojure/src/fm/atradio/native.clj).
#
# Auth first:
#   export CLOJARS_USERNAME=<user> CLOJARS_PASSWORD=<clojars-deploy-token>
# The fm.atradio group must be verified on Clojars (Verified Groups).
#
# Usage:
#   ./publish-clojure.sh <tag> [dir-of-libs]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
clj="$here/../clojure"
tag="${1:?usage: publish-clojure.sh <tag> [dir-of-libs]}"
dir="${2:-}"

command -v clojure >/dev/null 2>&1 || { echo "error: clojure CLI not found — https://clojure.org/guides/install_clojure" >&2; exit 1; }

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag uniffi libs → $dir"
  gh release download "$tag" --dir "$dir" --pattern 'libatradio_uniffi-*'
fi

"$here/gen-uniffi-manifest.sh" "$dir" "$tag"

cd "$clj"
# A local dev lib under native/ must not be bundled — build.clj ships only
# src + resources, but clear it so the jar is unambiguously native-free.
rm -f native/*.so native/*.dylib native/*.dll
echo "deploying fm.atradio/sdk to Clojars…"
clojure -T:build deploy
echo "Done."
