//// The audio stream reverse-proxy (`/api/stream?url=`).
////
//// Streams an upstream radio stream through to the client so the Rockbox wasm
//// decoder can fetch it cross-origin (most hosts send no CORS). The upstream is
//// driven by `gun` (see `proxy_gun_ffi.erl`); each chunk it delivers becomes a
//// `mist.send_chunk` in the loop below. Port of the `/stream` handler in
//// `apps/api/src/proxy/index.ts`.

import gleam/bytes_tree
import gleam/erlang/process.{type Pid, type Subject}
import gleam/http.{Get}
import gleam/http/request.{type Request}
import gleam/int
import gleam/http/response.{type Response}
import gleam/httpc
import gleam/list
import gleam/option
import gleam/regexp
import gleam/result
import gleam/string
import logging
import media_proxy/config
import media_proxy/playlist
import mist.{type Connection, type ResponseData}

/// Upstream headers worth forwarding, incl. the ICY metadata the decoder reads.
const forward_headers = [
  "content-type", "icy-metaint", "icy-name", "icy-genre", "icy-br",
  "icy-description", "icy-url",
]

const cors_expose = "content-type, icy-metaint, icy-name, icy-genre, icy-br, icy-description, icy-url"

/// Messages the gun pump forwards to the chunked-response actor.
pub type PumpMsg {
  GunChunk(BitArray)
  GunEof
  GunFailed
}

type Opened {
  Opened(pump: Pid, status: Int, headers: List(#(String, String)), fin: Bool)
}

@external(erlang, "proxy_gun_ffi", "open")
fn gun_open(url: String, headers: List(#(String, String))) -> Result(Opened, Nil)

@external(erlang, "proxy_gun_ffi", "go")
fn gun_go(pump: Pid, subj: Subject(PumpMsg)) -> Nil

pub fn handle(req: Request(Connection)) -> Response(ResponseData) {
  case query_url(req) {
    Error(_) -> bad_request()
    Ok(url) -> {
      let target = url |> rewrite_legacy_tunein |> resolve_target
      case gun_open(target, upstream_headers(req)) {
        Error(_) -> {
          logging.log(logging.Warning, "stream: upstream open failed: " <> target)
          bad_gateway()
        }
        Ok(Opened(pump:, status:, headers:, fin:)) -> {
          logging.log(
            logging.Info,
            "stream: " <> int.to_string(status) <> " " <> target,
          )
          let head =
            response.new(status)
            |> copy_forward_headers(headers)
            |> response.set_header("access-control-allow-origin", "*")
            |> response.set_header("access-control-expose-headers", cors_expose)
            |> response.set_header("cache-control", "no-store")
          case fin {
            // No body (e.g. a HEAD-like/empty response) — nothing to stream.
            True ->
              head |> response.set_body(mist.Bytes(bytes_tree.new()))
            False ->
              mist.chunked(
                request: req,
                response: head,
                init: fn(subj) {
                  gun_go(pump, subj)
                  Nil
                },
                loop: fn(state, msg, conn) {
                  case msg {
                    GunChunk(data) -> {
                      let _ = mist.send_chunk(conn, data)
                      mist.chunk_continue(state)
                    }
                    GunEof -> mist.chunk_stop()
                    GunFailed -> mist.chunk_stop_abnormal("upstream error")
                  }
                },
              )
          }
        }
      }
    }
  }
}

// ---- helpers ---------------------------------------------------------------

fn query_url(req: Request(Connection)) -> Result(String, Nil) {
  use pairs <- result.try(request.get_query(req))
  use url <- result.try(list.key_find(pairs, "url"))
  case string.starts_with(url, "http://") || string.starts_with(url, "https://") {
    True -> Ok(url)
    False -> Error(Nil)
  }
}

fn upstream_headers(req: Request(Connection)) -> List(#(String, String)) {
  [#("user-agent", config.upstream_user_agent)]
  |> forward(req, "icy-metadata")
  |> forward(req, "range")
}

fn forward(
  headers: List(#(String, String)),
  req: Request(Connection),
  name: String,
) -> List(#(String, String)) {
  case request.get_header(req, name) {
    Ok(value) -> [#(name, value), ..headers]
    Error(_) -> headers
  }
}

fn copy_forward_headers(
  resp: Response(a),
  upstream: List(#(String, String)),
) -> Response(a) {
  list.fold(upstream, resp, fn(r, h) {
    case list.contains(forward_headers, string.lowercase(h.0)) {
      True -> response.set_header(r, h.0, h.1)
      False -> r
    }
  })
}

/// `.pls`/`.m3u` unwrap to the real stream (finite body → httpc). `.m3u8` is
/// never unwrapped (the client plays HLS directly).
/// Re-point a legacy `<host>/api/tunein/…` URL (baked into old favorites, back
/// when the proxy lived on the AppView) straight at the real TuneIn origin.
/// Same result as routing through this proxy's own `/api/tunein`, minus a
/// self-request hop — and it self-heals stale links without the API redirect.
fn rewrite_legacy_tunein(url: String) -> String {
  case
    regexp.compile(
      "^https?://[^/]+/api/tunein",
      regexp.Options(case_insensitive: True, multi_line: False),
    )
  {
    Ok(re) -> regexp.replace(re, url, "https://opml.radiotime.com")
    Error(_) -> url
  }
}

fn resolve_target(url: String) -> String {
  case playlist.is_unwrappable(url) {
    True ->
      case fetch_text(url) {
        Ok(body) -> playlist.first_stream_url(body) |> option.unwrap(url)
        Error(_) -> url
      }
    False -> url
  }
}

fn fetch_text(url: String) -> Result(String, Nil) {
  case request.to(url) {
    Error(_) -> Error(Nil)
    Ok(base) ->
      base
      |> request.set_method(Get)
      |> fn(req) {
        httpc.configure()
        |> httpc.follow_redirects(True)
        |> httpc.timeout(5000)
        |> httpc.dispatch(req)
      }
      |> result.map(fn(r) { r.body })
      |> result.replace_error(Nil)
  }
}

fn bad_request() -> Response(ResponseData) {
  json(400, "{\"error\":\"InvalidRequest\",\"message\":\"url must be http(s)\"}")
}

fn bad_gateway() -> Response(ResponseData) {
  json(502, "{\"error\":\"BadGateway\"}")
}

fn json(status: Int, body: String) -> Response(ResponseData) {
  response.new(status)
  |> response.set_header("content-type", "application/json")
  |> response.set_header("access-control-allow-origin", "*")
  |> response.set_body(mist.Bytes(bytes_tree.from_string(body)))
}
