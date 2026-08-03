# atradio media proxy (TypeScript / Bun)

A small, **stateless** reverse-proxy for the bits of the web app that need a
CORS-friendly, mixed-content-safe upstream. The long-lived, bandwidth-heavy
streaming workload scales and fails independently of discovery + the Connect hub.

A TypeScript/Bun implementation of `apps/media-proxy` — same routes, same
behaviour, same wire contract, so it's a drop-in replacement.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/stream?url=` | Reverse-proxy an audio stream, piped chunk-by-chunk so the Rockbox wasm decoder can fetch it cross-origin (keeps the DSP/EQ in the signal path). Unwraps `.pls`/`.m3u`; forwards ICY metadata + `Range`; follows redirects. |
| `GET /api/tunein/*` | Proxy `opml.radiotime.com/*` (TuneIn sends no CORS). |
| `GET /api/image?url=` | Proxy `http://` station artwork (mixed-content). Only image responses are relayed. |
| `GET /api/icy?url=` | ICY "now playing" (`{ "title": … }`). Bounded read of the interleaved metadata blocks; unwraps playlists first. |
| `GET /healthz` | Liveness. |

Every route is public + read-only, so CORS is a blanket `origin: *` with the ICY
headers exposed.

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `7081` | HTTP listen port. |
| `RATE_LIMIT` | `120` | Max `/api/*` requests per IP per window (429 over it). |
| `RATE_WINDOW` | `60` | Rate-limit window, seconds. |

## Develop

```sh
bun install
bun run dev     # start the proxy with --watch (PORT env, default 7081)
bun test        # unit tests (playlist parsing + port config)
PORT=9000 bun run start
```

Quick check:

```sh
curl localhost:7081/healthz                      # ok
curl "localhost:7081/api/stream?url=https://..."  # piped audio
```

## Deploy

Run from source under Bun — see `systemd/atradio-media-proxy-ts.service`. It
listens on `PORT=7081` by default, the same port as the Gleam unit
(`atradio-media-proxy.service`), so enable only one at a time when swapping.

## Layout

```
src/
├─ index.ts       # Bun.serve + router + CORS + rate-limit + PORT env
├─ config.ts      # env config (PORT, RATE_LIMIT, RATE_WINDOW)
├─ stream.ts      # /api/stream — streaming reverse-proxy
├─ simple.ts      # /api/tunein, /api/image, /api/icy handlers
├─ icy.ts         # ICY StreamTitle reader
├─ playlist.ts    # .pls/.m3u unwrapping
├─ cache.ts       # per-node TTL cache (TuneIn 300s, ICY 20s)
├─ ratelimit.ts   # per-node fixed-window rate limiter
└─ upstream.ts    # raw-socket HTTP client for the streaming/ICY upstreams
```

TuneIn + ICY responses are cached in a node-local `Map` (no Redis); a cache hit
is served with `x-cache: HIT`.

### Why a raw-socket upstream?

`/api/stream` and `/api/icy` can't use `fetch`: radio streams answer with a
non-HTTP `ICY 200 OK` status line that strict parsers reject, carry no
`content-length` (the body is delimited by the connection closing, and is
effectively infinite), and interleave metadata blocks that need byte-level
walking. `upstream.ts` speaks HTTP/1.1 by hand over `node:net`/`node:tls` so it
tolerates the `ICY` status line, streams the body unbuffered with backpressure,
and never imposes a total-duration cap that would cut a listener off mid-song.
The finite, well-behaved routes (`/api/tunein`, `/api/image`) use `fetch`.
