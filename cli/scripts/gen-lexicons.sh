#!/usr/bin/env bash
# Regenerate the Rust bindings in src/{builder_types.rs,fm_atradio*} from the
# atradio lexicon JSON. Requires the jacquard codegen binary:
#   cargo install jacquard-lexgen        # provides `jacquard-codegen`
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
lexicons="$here/../packages/lexicons/lexicons/atradio"
out="$(mktemp -d)"
jacquard-codegen -i "$lexicons" -o "$out"
cp "$out/builder_types.rs" "$here/src/builder_types.rs"
cp "$out/fm_atradio.rs"    "$here/src/fm_atradio.rs"
rm -rf "$here/src/fm_atradio" && cp -r "$out/fm_atradio" "$here/src/fm_atradio"
echo "regenerated lexicon bindings in $here/src"
