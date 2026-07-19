#!/usr/bin/env bash
# Build the native atradio-uniffi library and drop it on the Clojure classpath
# (native/). The library is a build artifact (gitignored) — run after checkout /
# on any Rust change. The SDK binds the crate's C ABI via the JVM Panama FFM API.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/clojure
root="$here/../.."                    # repo root

case "$(uname -s)" in
  Darwin) lib=libatradio_uniffi.dylib ;;
  MINGW* | MSYS* | CYGWIN*) lib=atradio_uniffi.dll ;;
  *) lib=libatradio_uniffi.so ;;
esac

cargo build -p atradio-uniffi --manifest-path "$root/Cargo.toml"
cp "$root/target/debug/$lib" "$here/native/$lib"
echo "built atradio clojure binding → $here/native/$lib"
