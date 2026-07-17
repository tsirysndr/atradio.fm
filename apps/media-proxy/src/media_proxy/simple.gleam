//// Buffered proxy routes (finite bodies): TuneIn, artwork, ICY "now playing".
//// Port of the TuneIn/image/icy handlers in `apps/api/src/proxy/index.ts`.

import gleam/bytes_tree
import gleam/http.{Get}
import gleam/http/request.{type Request}
import gleam/http/response.{type Response}
import gleam/httpc
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import logging
import media_proxy/cache
import media_proxy/config
import media_proxy/icy as icy_meta
import media_proxy/playlist
import mist.{type Connection, type ResponseData}

const upstream_timeout_ms = 8000

/// Cache TTLs (seconds): TuneIn results are stable; ICY "now playing" changes
/// per song, so keep it short but enough to absorb concurrent listeners.
const tunein_ttl = 300

const icy_ttl = 20

/// Reverse-proxy `/api/tunein/*` to opml.radiotime.com (TuneIn sends no CORS).
pub fn tunein(
  req: Request(Connection),
  rest: List(String),
) -> Response(ResponseData) {
  let path = "/" <> string.join(rest, "/")
  let suffix = case req.query {
    Some(q) -> "?" <> q
    None -> ""
  }
  let key = "tunein:" <> path <> suffix

  case cache.get(key) {
    // Cached value is `content-type <> "\n" <> body`.
    Ok(cached) ->
      case string.split_once(cached, "\n") {
        Ok(#(ct, body)) -> x_cache(relay_text(200, Some(ct), body), "HIT")
        Error(_) -> x_cache(relay_text(200, None, cached), "HIT")
      }
    Error(_) -> {
      let target = "https://opml.radiotime.com" <> path <> suffix
      let accept =
        request.get_header(req, "accept") |> result.unwrap("application/json")
      case get_text(target, [#("accept", accept)]) {
        Ok(res) -> {
          let ct =
            response.get_header(res, "content-type")
            |> result.unwrap("application/json")
          case is_ok(res.status) {
            True -> cache.set(key, ct <> "\n" <> res.body, tunein_ttl)
            False -> Nil
          }
          x_cache(relay_text(res.status, Some(ct), res.body), "MISS")
        }
        Error(_) -> {
          logging.log(logging.Warning, "tunein: upstream failed: " <> target)
          json_response(502, "{\"error\":\"BadGateway\"}")
        }
      }
    }
  }
}

/// Reverse-proxy a station logo so the https app can show `http://` favicons
/// without mixed-content blocking. Only actual image responses are relayed.
pub fn image(req: Request(Connection)) -> Response(ResponseData) {
  case query_url(req) {
    None -> bad_request()
    Some(url) ->
      case
        get_bits(url, [
          #("user-agent", config.upstream_user_agent),
          #("accept", "image/*"),
        ])
      {
        Error(_) -> {
          logging.log(logging.Warning, "image: upstream failed: " <> url)
          empty(502)
        }
        Ok(res) -> {
          let ct = response.get_header(res, "content-type") |> result.unwrap("")
          case is_ok(res.status) && string.starts_with(ct, "image/") {
            True ->
              response.new(200)
              |> response.set_header("content-type", ct)
              |> response.set_header("cache-control", "public, max-age=86400")
              |> response.set_body(mist.Bytes(bytes_tree.from_bit_array(res.body)))
            False -> empty(415)
          }
        }
      }
  }
}

/// `/api/icy?url=<stream>` -> `{ "title": ... }`. Best-effort — a stream with
/// no ICY metadata (or a transient read failure) simply reports `null`.
pub fn icy(req: Request(Connection)) -> Response(ResponseData) {
  case query_url(req) {
    None -> json_response(200, "{\"title\":null}")
    Some(url) -> {
      let key = "icy:" <> url
      case cache.get(key) {
        Ok(body) -> x_cache(json_response(200, body), "HIT")
        Error(_) -> {
          let title = icy_meta.read_title(resolve_stream(url))
          let body =
            json.to_string(
              json.object([#("title", json.nullable(title, json.string))]),
            )
          cache.set(key, body, icy_ttl)
          x_cache(json_response(200, body), "MISS")
        }
      }
    }
  }
}

/// `.pls`/`.m3u` playlists point at the real stream — unwrap before reading ICY.
fn resolve_stream(url: String) -> String {
  case playlist.is_unwrappable(url) {
    True ->
      case get_text(url, []) {
        Ok(res) -> playlist.first_stream_url(res.body) |> option.unwrap(url)
        Error(_) -> url
      }
    False -> url
  }
}

// ---- helpers ---------------------------------------------------------------

fn get_text(
  url: String,
  headers: List(#(String, String)),
) -> Result(Response(String), Nil) {
  case request.to(url) {
    Error(_) -> Error(Nil)
    Ok(base) ->
      base
      |> request.set_method(Get)
      |> with_headers(headers)
      |> fn(req) {
        httpc.configure()
        |> httpc.follow_redirects(True)
        |> httpc.timeout(upstream_timeout_ms)
        |> httpc.dispatch(req)
      }
      |> result.replace_error(Nil)
  }
}

fn get_bits(
  url: String,
  headers: List(#(String, String)),
) -> Result(Response(BitArray), Nil) {
  case request.to(url) {
    Error(_) -> Error(Nil)
    Ok(base) ->
      base
      |> request.set_method(Get)
      |> request.set_body(<<>>)
      |> with_headers(headers)
      |> fn(req) {
        httpc.configure()
        |> httpc.follow_redirects(True)
        |> httpc.timeout(upstream_timeout_ms)
        |> httpc.dispatch_bits(req)
      }
      |> result.replace_error(Nil)
  }
}

fn with_headers(
  req: Request(body),
  headers: List(#(String, String)),
) -> Request(body) {
  list.fold(headers, req, fn(r, h) { request.set_header(r, h.0, h.1) })
}

fn query_url(req: Request(Connection)) -> Option(String) {
  case request.get_query(req) {
    Ok(pairs) ->
      case list.key_find(pairs, "url") {
        Ok(url) ->
          case string.starts_with(url, "http://") || string.starts_with(url, "https://") {
            True -> Some(url)
            False -> None
          }
        Error(_) -> None
      }
    Error(_) -> None
  }
}

fn is_ok(status: Int) -> Bool {
  status >= 200 && status < 300
}

fn relay_text(
  status: Int,
  content_type: Option(String),
  body: String,
) -> Response(ResponseData) {
  let base =
    response.new(status)
    |> response.set_body(mist.Bytes(bytes_tree.from_string(body)))
  case content_type {
    Some(ct) -> response.set_header(base, "content-type", ct)
    None -> base
  }
}

fn json_response(status: Int, body: String) -> Response(ResponseData) {
  response.new(status)
  |> response.set_header("content-type", "application/json")
  |> response.set_body(mist.Bytes(bytes_tree.from_string(body)))
}

fn x_cache(res: Response(ResponseData), state: String) -> Response(ResponseData) {
  response.set_header(res, "x-cache", state)
}

fn bad_request() -> Response(ResponseData) {
  json_response(
    400,
    "{\"error\":\"InvalidRequest\",\"message\":\"url must be http(s)\"}",
  )
}

fn empty(status: Int) -> Response(ResponseData) {
  response.new(status)
  |> response.set_body(mist.Bytes(bytes_tree.new()))
}
