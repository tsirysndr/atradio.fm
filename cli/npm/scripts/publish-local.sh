#!/usr/bin/env bash
# Assemble the npm platform packages from prebuilt release binaries — and,
# optionally, publish them — from a local machine.
#
# You can't cross-build all four targets (darwin x64/arm64, linux x64/arm64) on
# one machine, so this downloads the binaries the release workflow already built
# and attached to the GitHub release, dropping each into its platform package
# (platforms/<target>/bin/atradio, gitignored).
#
# Usage:
#   scripts/publish-local.sh [VERSION] [--publish]
#
#   VERSION    release tag to pull, e.g. v0.5.2 (default: v<package.json version>)
#   --publish  after assembling, publish to npm — platform packages first, then
#              @atradio/cli. Omit to only download + assemble.
#
# Requires: gh (authenticated), tar, node. For --publish you must also be
# `npm login`ed as an account with write access to the @atradio scope.
# NOTE: --provenance is intentionally NOT used; it only works from GitHub
# Actions (OIDC) and fails locally.

set -euo pipefail

REPO="${ATRADIO_REPO:-tsirysndr/atradio.fm}"

# Resolve paths relative to this script so it works from any CWD.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
npm_dir="$(cd "${script_dir}/.." && pwd)"
cd "${npm_dir}"

# Args: an optional VERSION (first non-flag) and an optional --publish flag.
version=""
publish=0
for arg in "$@"; do
  case "${arg}" in
    --publish) publish=1 ;;
    -*) echo "unknown flag: ${arg}" >&2; exit 2 ;;
    *) version="${arg}" ;;
  esac
done

# Default the version to v + the main package's current version.
if [ -z "${version}" ]; then
  version="v$(node -p "require('./package.json').version")"
fi

echo "▸ repo=${REPO}  version=${version}  publish=${publish}"

# Keep every package.json in sync with the tag we're assembling.
node scripts/stamp-version.mjs "${version}"

dl_dir="$(mktemp -d)"
trap 'rm -rf "${dl_dir}"' EXIT

# GitHub release label -> npm platform package directory.
for pair in macos-amd64:darwin-x64 macos-aarch64:darwin-arm64 \
            linux-amd64:linux-x64 linux-aarch64:linux-arm64; do
  label="${pair%%:*}"; target="${pair##*:}"
  tarball="atradio-${version}-${label}.tar.gz"

  echo "▸ downloading ${tarball}"
  gh release download "${version}" -R "${REPO}" -p "${tarball}" -D "${dl_dir}" --clobber

  tmp="$(mktemp -d)"
  tar -xzf "${dl_dir}/${tarball}" -C "${tmp}"
  mkdir -p "platforms/${target}/bin"
  cp "${tmp}/atradio" "platforms/${target}/bin/atradio"
  chmod 0755 "platforms/${target}/bin/atradio"
  rm -rf "${tmp}"
  echo "  assembled @atradio/cli-${target}"
done

if [ "${publish}" -eq 0 ]; then
  echo "✓ binaries assembled under platforms/*/bin. Re-run with --publish to publish."
  exit 0
fi

# Platform packages first — the main package's optionalDependencies point at
# them, so they must exist on the registry before it is installable.
for target in darwin-x64 darwin-arm64 linux-x64 linux-arm64; do
  echo "▸ publishing @atradio/cli-${target}"
  npm publish "./platforms/${target}" --access public
done

echo "▸ publishing @atradio/cli"
npm publish --access public

echo "✓ published ${version}"
