#!/usr/bin/env bash
# Build the native atradio-uniffi library and (re)generate the Python bindings
# into the `atradio` package. Both the generated module and the shared library
# are build artifacts (gitignored) — run this after checkout / on any Rust change.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/python
root="$here/../.."                    # repo root
pkg="$here/src/atradio"

case "$(uname -s)" in
  Darwin) lib=libatradio_uniffi.dylib ;;
  MINGW* | MSYS* | CYGWIN*) lib=atradio_uniffi.dll ;;
  *) lib=libatradio_uniffi.so ;;
esac

cargo build -p atradio-uniffi --manifest-path "$root/Cargo.toml"
cargo run -q -p atradio-uniffi --manifest-path "$root/Cargo.toml" --bin uniffi-bindgen -- \
  generate --library "$root/target/debug/$lib" --language python --out-dir "$pkg"
cp "$root/target/debug/$lib" "$pkg/$lib"
echo "built atradio python binding → $pkg (module + $lib)"
