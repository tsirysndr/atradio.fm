# atradio media proxy

A small, **stateless** reverse-proxy (Gleam on the BEAM) for the bits of the
web app that need a CORS-friendly, mixed-content-safe upstream. Extracted from
the AppView (`apps/api`) so the long-lived, bandwidth-heavy streaming workload
scales and fails independently of discovery + the Connect hub.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/stream?url=` | Reverse-proxy an audio stream, piped chunk-by-chunk so the Rockbox wasm decoder can fetch it cross-origin (keeps the DSP/EQ in the signal path). Unwraps `.pls`/`.m3u`; forwards ICY metadata + `Range`; follows redirects. |
| `GET /api/tunein/*` | Proxy `opml.radiotime.com/*` (TuneIn sends no CORS). |
| `GET /api/image?url=` | Proxy `http://` station artwork (mixed-content). Only image responses are relayed. |
| `GET /api/icy?url=` | ICY "now playing" (`{ "title": … }`). **Stub** — see the TODO in `simple.gleam`. |
| `GET /healthz` | Liveness. |

Every route is public + read-only, so CORS is a blanket `origin: *` with the ICY
headers exposed.

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `7081` | HTTP listen port. |

## Develop

```sh
gleam run    # start the proxy (PORT env, default 7081)
gleam test   # unit tests (playlist parsing + port config)
PORT=9000 gleam run
```

Quick check:

```sh
curl localhost:7081/healthz                     # ok
curl "localhost:7081/api/stream?url=https://..." # piped audio
```

## Deploy

Run from source under the toolchain (mirrors the api/jetstream units) — see
`systemd/atradio-media-proxy.service`. For a self-contained release instead:

```sh
gleam export erlang-shipment
./build/erlang-shipment/entrypoint.sh run
```

## Layout

```
src/
├─ atradio_media_proxy.gleam   # mist server + router + CORS + PORT env
├─ media_proxy/config.gleam    # env config (PORT)
├─ media_proxy/stream.gleam    # /stream — streaming reverse-proxy
├─ media_proxy/simple.gleam    # /tunein, /image, /icy (buffered)
├─ media_proxy/playlist.gleam  # .pls/.m3u unwrapping
└─ proxy_gun_ffi.erl           # gun streaming ↔ mist.chunked bridge
```

The `gun` FFI is the one piece Node hands you free (`stream.pipe`): a pump
process owns the upstream connection and forwards each chunk to the Gleam
`Subject` that drives `mist.chunked`.

## Web wiring

Point the web app at this service instead of the AppView for the proxy routes
(e.g. `VITE_MEDIA_PROXY`), then delete `apps/api/src/proxy/`. The AppView keeps
XRPC + Jetstream + the `/connect` hub + `/health`.
