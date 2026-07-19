#!/usr/bin/env bash
# Publish the Gleam SDK (atradio_gleam) to Hex. Pure Gleam — no native build; it
# depends on the published atradio_erl (publish that FIRST with publish-erlang.sh).
#
# For monorepo dev gleam.toml depends on atradio_erl via a path dep; Hex rejects
# path deps, so this temporarily rewrites that line to the released Hex version
# requirement (>= <vsn> and < <next major>.0.0), publishes, then restores
# gleam.toml + manifest.toml (a trap restores them even on failure).
#
# Auth first: gleam hex authenticate (or export HEXPM_API_KEY=...).
# Usage: ./publish-gleam.sh [--dry-run]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
gleam_dir="$here/../gleam"
dry=0
[ "${1:-}" = "--dry-run" ] && dry=1

command -v gleam >/dev/null 2>&1 || { echo "error: gleam not found — https://gleam.run" >&2; exit 1; }

ver="$(sed -n 's/.*{vsn, *"\([^"]*\)".*/\1/p' "$here/../erlang/src/atradio_erl.app.src" | head -1)"
[ -n "$ver" ] || { echo "error: could not read atradio_erl version from app.src" >&2; exit 1; }
next_major=$(( ${ver%%.*} + 1 ))
req=">= $ver and < $next_major.0.0"

echo "== atradio_gleam -> Hex =="
echo "atradio_erl dep: $req (publish that package first if you haven't)"

toml="$gleam_dir/gleam.toml"
manifest="$gleam_dir/manifest.toml"
toml_bak="$(mktemp)"; manifest_bak="$(mktemp)"
cp "$toml" "$toml_bak"
[ -f "$manifest" ] && cp "$manifest" "$manifest_bak" || : > "$manifest_bak"
restore() {
  cp "$toml_bak" "$toml"
  if [ -s "$manifest_bak" ]; then cp "$manifest_bak" "$manifest"; else rm -f "$manifest"; fi
  rm -f "$toml_bak" "$manifest_bak"
  # Drop Hex-resolved artifacts so the next dev build re-resolves the path dep.
  rm -rf "$gleam_dir/build"
}
trap restore EXIT

# Swap the `atradio_erl = { path = ... }` line for the Hex version requirement.
python3 - "$toml" "$req" <<'PY'
import re, sys
path, req = sys.argv[1], sys.argv[2]
src = open(path).read()
new, n = re.subn(r'^atradio_erl\s*=.*$', f'atradio_erl = "{req}"', src, count=1, flags=re.M)
if n != 1:
    sys.exit("could not find the atradio_erl dependency line in gleam.toml")
open(path, "w").write(new)
PY
echo "rewrote gleam.toml dep → atradio_erl = \"$req\""

if [ "$dry" -eq 1 ]; then
  echo "DRY RUN — gleam.toml rewritten (restored on exit); not publishing."
  grep '^atradio_erl' "$toml"
else
  gleam publish --yes
fi
echo "Done."
