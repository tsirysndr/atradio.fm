#!/usr/bin/env bash
# Publish the Ruby SDK to RubyGems. Runs LOCALLY (RubyGems auth is interactive)
# after bindings-release.yml has built + uploaded the per-triple uniffi libraries
# to the bindings-v<vsn> GitHub release.
#
# The gem ships no native lib: this fills lib/manifest.json from the release
# artifacts, builds a single (platform-agnostic) gem, and `gem push`es it. The
# native lib is fetched on first load (see sdk/ruby/lib/atradio/native.rb).
#
# Auth first:  gem signin   (or export GEM_HOST_API_KEY=rubygems_xxx)
#
# Usage:
#   ./publish-ruby.sh <tag> [dir-of-libs]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
rb="$here/../ruby"
tag="${1:?usage: publish-ruby.sh <tag> [dir-of-libs]}"
dir="${2:-}"

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag uniffi libs → $dir"
  gh release download "$tag" --dir "$dir" --pattern 'libatradio_uniffi-*'
fi

"$here/gen-uniffi-manifest.sh" "$dir" "$tag"

cd "$rb"
# The gemspec only globs *.rb + manifest.json, so a local dev lib can't be
# packed — but remove it anyway to keep the build hermetic.
rm -f lib/*.so lib/*.dylib lib/*.dll
gem build atradio.gemspec
gem_file="$(ls -t ./*.gem | head -1)"
echo "built $gem_file"
echo "pushing to RubyGems…"
gem push "$gem_file"
echo "Done."
