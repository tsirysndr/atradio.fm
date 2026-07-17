//// atradio media proxy — a small, stateless reverse-proxy for radio streams,
//// TuneIn, station artwork, and ICY "now playing" metadata.
////
//// Extracted from the AppView (apps/api) so the long-lived, bandwidth-heavy
//// streaming workload scales and fails independently of discovery + Connect.
//// Every route is public and read-only, so CORS is a blanket `origin: *`.

import gleam/bytes_tree
import gleam/erlang/process
import gleam/http
import gleam/http/request.{type Request}
import gleam/http/response.{type Response}
import gleam/int
import gleam/result
import logging
import media_proxy/cache
import media_proxy/config
import media_proxy/simple
import media_proxy/stream
import mist.{type Connection, type ResponseData}

pub fn main() {
  logging.configure()
  logging.set_level(logging.Info)
  // Owned by this (long-lived) process so it outlives request handlers.
  cache.init()

  let port = config.port()
  let assert Ok(_) =
    mist.new(handle)
    |> mist.bind("0.0.0.0")
    |> mist.port(port)
    |> mist.start
  logging.log(logging.Info, "media proxy listening on :" <> int.to_string(port))
  process.sleep_forever()
}

/// Access log around the router: `GET /api/stream -> 200`.
fn handle(req: Request(Connection)) -> Response(ResponseData) {
  let res = route(req)
  logging.log(
    logging.Info,
    http.method_to_string(req.method)
      <> " "
      <> req.path
      <> " -> "
      <> int.to_string(res.status),
  )
  res
}

fn route(req: Request(Connection)) -> Response(ResponseData) {
  case req.method {
    // CORS preflight (the decoder's `Icy-MetaData`/`Range` headers are
    // non-simple, so the browser sends an OPTIONS first).
    http.Options -> preflight(req)
    _ ->
      case request.path_segments(req) {
        [] -> cors(text(200, banner))
        ["healthz"] -> cors(text(200, "ok"))
        // The stream route sets its own headers (mist.chunked flushes them
        // immediately), so CORS is applied inside `stream.handle`, not here.
        ["api", "stream"] -> stream.handle(req)
        ["api", "icy"] -> cors(simple.icy(req))
        ["api", "image"] -> cors(simple.image(req))
        ["api", "tunein", ..rest] -> cors(simple.tunein(req, rest))
        _ -> cors(text(404, "not found"))
      }
  }
}

/// Landing page served at `GET /`.
const banner = "
       )))
   ((  •  ))     a t r a d i o
       )))       m e d i a   p r o x y
  ───────────────────────────────────────────────

  Stateless reverse-proxy for radio streams, TuneIn,
  artwork, and ICY \"now playing\" metadata.

    GET /api/stream?url=   pipe an audio stream (CORS-safe)
    GET /api/tunein/*      TuneIn OPML proxy
    GET /api/image?url=    station artwork proxy
    GET /api/icy?url=      ICY now-playing title
    GET /healthz           liveness

  Gleam · BEAM · https://atradio.fm
"

/// Headers to expose so the wasm decoder can read ICY metadata cross-origin.
pub const cors_expose_headers = "content-type, icy-metaint, icy-name, icy-genre, icy-br, icy-description, icy-url"

fn cors(res: Response(ResponseData)) -> Response(ResponseData) {
  res
  |> response.set_header("access-control-allow-origin", "*")
  |> response.set_header("access-control-expose-headers", cors_expose_headers)
}

/// Answer a CORS preflight, reflecting whatever headers the browser asked to
/// send (e.g. `icy-metadata`, `range`) so the real request is allowed.
fn preflight(req: Request(Connection)) -> Response(ResponseData) {
  let allow_headers =
    request.get_header(req, "access-control-request-headers")
    |> result.unwrap("icy-metadata, range, content-type")
  response.new(204)
  |> response.set_header("access-control-allow-origin", "*")
  |> response.set_header("access-control-allow-methods", "GET, HEAD, OPTIONS")
  |> response.set_header("access-control-allow-headers", allow_headers)
  |> response.set_header("access-control-max-age", "86400")
  |> response.set_body(mist.Bytes(bytes_tree.new()))
}

fn text(status: Int, body: String) -> Response(ResponseData) {
  response.new(status)
  |> response.set_header("content-type", "text/plain; charset=utf-8")
  |> response.set_body(mist.Bytes(bytes_tree.from_string(body)))
}
