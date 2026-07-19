#!/usr/bin/env bash
# Build the native binding libraries (release) and stage them with an optional
# target-triple suffix for release upload. Both are cdylibs from the Cargo
# workspace and back the language SDKs:
#   - libatradio_uniffi.<ext>  → Python (UniFFI), Ruby (fiddle), Clojure (Panama)
#   - atradio_nif.so           → Erlang (Rustler NIF; loaded as .so on all Unix)
#
# Usage:
#   ./build-native.sh                      # host build, unsuffixed → dist/
#   ./build-native.sh x86_64-linux-gnu     # suffixed name for a release asset
#   OUT=/tmp/x ./build-native.sh <triple>  # custom output dir
#
# CI (bindings-release.yml) runs this on a native runner per target; the triple
# only names the output (each target is built natively, not cross-compiled).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/scripts
root="$here/../.."                    # repo root
target="${1:-}"
out="${OUT:-$here/dist}"
mkdir -p "$out"

cargo build --release --manifest-path "$root/Cargo.toml" -p atradio-uniffi -p atradio-nif

case "$(uname -s)" in
  Darwin) uext=dylib; nifsrc=libatradio_nif.dylib ;;
  MINGW* | MSYS* | CYGWIN*) uext=dll; nifsrc=atradio_nif.dll ;;
  *) uext=so; nifsrc=libatradio_nif.so ;;
esac
sfx=""
[ -n "$target" ] && sfx="-$target"

cp "$root/target/release/libatradio_uniffi.$uext" "$out/libatradio_uniffi$sfx.$uext"
# The Erlang NIF is loaded as .so on every Unix (including macOS).
cp "$root/target/release/$nifsrc" "$out/atradio_nif$sfx.so"

echo "staged native libs in $out:"
ls -1 "$out"
