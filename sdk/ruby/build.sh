#!/usr/bin/env bash
# Build the native atradio-uniffi library and drop it next to the Ruby binding.
# The .dylib/.so is a build artifact (gitignored) — run this after checkout / on
# any Rust change. The Ruby SDK talks to the crate's plain C ABI via fiddle
# (stdlib), so there's no codegen and no `ffi` gem dependency.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/ruby
root="$here/../.."                    # repo root

case "$(uname -s)" in
  Darwin) lib=libatradio_uniffi.dylib ;;
  MINGW* | MSYS* | CYGWIN*) lib=atradio_uniffi.dll ;;
  *) lib=libatradio_uniffi.so ;;
esac

cargo build -p atradio-uniffi --manifest-path "$root/Cargo.toml"
cp "$root/target/debug/$lib" "$here/lib/$lib"
echo "built atradio ruby binding → $here/lib/$lib"
