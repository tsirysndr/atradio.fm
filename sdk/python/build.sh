#!/usr/bin/env bash
# (Re)generate the Python bindings for the `atradio` package and patch the
# UniFFI loader for download-on-load.
#
# The generated module (atradio_uniffi.py) is COMMITTED so the published wheel is
# pure-Python and needs no Rust to install — its native library is fetched from
# the GitHub release on first import (see _native.py), or a local dev build in
# the package dir is preferred. Run this after any Rust change to the FFI surface.
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

# Patch the generated loader: resolve the library path via _native (local dev
# build, else a checksum-verified download from the release) instead of the
# fixed package-dir path UniFFI emits.
python3 - "$pkg/atradio_uniffi.py" <<'PY'
import sys
p = sys.argv[1]
src = open(p).read()
old = "    path = os.path.join(os.path.dirname(__file__), libname)"
new = "    from . import _native as _atradio_native  # atradio: download-on-load\n    path = _atradio_native.resolve()"
if old not in src and "_atradio_native" not in src:
    raise SystemExit("could not find the UniFFI loader line to patch")
if old in src:
    src = src.replace(old, new, 1)
    open(p, "w").write(src)
    print("patched atradio_uniffi.py loader → _native.resolve()")
else:
    print("atradio_uniffi.py loader already patched")
PY

# A local dev build in the package dir is preferred by _native.resolve()
# (gitignored). The published wheel ships neither this nor the module regen.
cp "$root/target/debug/$lib" "$pkg/$lib"
echo "built atradio python binding → $pkg (patched module + $lib)"
