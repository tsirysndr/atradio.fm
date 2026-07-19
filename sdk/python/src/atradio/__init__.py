"""Official Python SDK for atradio.fm.

Thin re-export of the UniFFI-generated bindings to the shared Rust core
(``atradio-sdk``), so the auth / record / reconcile logic is identical to the
Rust, Go, and TypeScript SDKs.

    from atradio import AppView, Agent, favorite_rkey

    av = AppView()
    for s in av.recent_stations(10):
        print(s.station.name)

The generated ``atradio_uniffi`` module and its native library are produced by
``build.sh`` (both are build artifacts).
"""

from .atradio_uniffi import *  # noqa: F401,F403
