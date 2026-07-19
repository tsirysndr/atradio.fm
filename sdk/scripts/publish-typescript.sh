#!/usr/bin/env bash
# Publish the TypeScript SDK to npm: @atradio/lexicons (its dep) then @atradio/sdk.
#
# Pure TS/JS — no native lib, no GitHub-release download. Built with tsc,
# published with bun (which rewrites the workspace:* dependency to the real
# version). For dev, each package's `exports` points at src (so the web +
# tooling use source); at publish time this script rewrites exports/main/types
# to the tsc-built dist, publishes, then restores the file.
#
# Auth first: npm login (or an authToken in ~/.npmrc; bun reads it). The @atradio
# scope must exist on npm and your token must own it.
#
# Usage: ./publish-typescript.sh [--dry-run]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
dry=""
[ "${1:-}" = "--dry-run" ] && dry="--dry-run"

command -v bun >/dev/null 2>&1 || { echo "error: bun not found (https://bun.sh)" >&2; exit 1; }

( cd "$root" && bun install )

# Repoint a package's `.` export (+ main/module/types) at the built dist,
# preserving any other export subpaths. Restored from git after publish.
repoint_to_dist() {
  python3 - "$1/package.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["main"] = "./dist/index.js"
d["module"] = "./dist/index.js"
d["types"] = "./dist/index.d.ts"
exports = {".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"}}
for k, v in (d.get("exports") or {}).items():
    if k != ".":
        exports[k] = v
d["exports"] = exports
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
PY
}

publish_pkg() {
  local dir="$1" name="$2"
  echo "== $name -> npm =="
  ( cd "$dir" && bun run build )
  repoint_to_dist "$dir"
  ( cd "$dir" && bun publish --access public $dry ) || { git -C "$root" checkout -- "$dir/package.json"; exit 1; }
  git -C "$root" checkout -- "$dir/package.json"
}

# The dependency must be on npm first so @atradio/sdk resolves it.
publish_pkg "$root/packages/lexicons" "@atradio/lexicons"
publish_pkg "$root/sdk/typescript" "@atradio/sdk"
echo "Done."
