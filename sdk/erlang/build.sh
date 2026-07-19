#!/usr/bin/env bash
# Build the Rustler NIF and compile the Erlang modules. The native library is a
# build artifact (gitignored) — run after checkout / on any Rust change.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/erlang
root="$here/../.."                    # repo root

case "$(uname -s)" in
  Darwin) libfile=libatradio_nif.dylib ;;
  MINGW* | MSYS* | CYGWIN*) libfile=atradio_nif.dll ;;
  *) libfile=libatradio_nif.so ;;
esac

cargo build -p atradio-nif --manifest-path "$root/Cargo.toml"
mkdir -p "$here/priv" "$here/ebin"
# BEAM loads NIFs as .so on every Unix (including macOS), so normalize the name.
cp "$root/target/debug/$libfile" "$here/priv/atradio_nif.so"
erlc -o "$here/ebin" "$here"/src/*.erl
echo "built atradio erlang binding → $here/priv/atradio_nif.so + ebin/"
