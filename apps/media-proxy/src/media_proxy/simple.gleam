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
import media_proxy/config
import mist.{type Connection, type ResponseData}

const upstream_timeout_ms = 8000

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
  let target = "https://opml.radiotime.com" <> path <> suffix
  let accept =
    request.get_header(req, "accept") |> result.unwrap("application/json")

  // TODO(cache): TuneIn results are stable — add a ~300s ETS/actor cache.
  case get_text(target, [#("accept", accept)]) {
    Ok(res) -> {
      let ct = response.get_header(res, "content-type") |> option.from_result
      relay_text(res.status, ct, res.body)
    }
    Error(_) -> {
      logging.log(logging.Warning, "tunein: upstream failed: " <> target)
      json_response(502, "{\"error\":\"BadGateway\"}")
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

/// `/api/icy?url=<stream>` -> `{ "title": ... }`.
pub fn icy(req: Request(Connection)) -> Response(ResponseData) {
  // TODO: port `readIcyTitle`. It needs a *bounded* streaming read
  // (metaint*2 + 4096 bytes, then abort) — httpc buffers the whole body, which
  // never returns on an endless stream. Reuse the gun-based reader from
  // `proxy_gun_ffi` with a byte cap, then parse `StreamTitle='…'` out of the
  // interleaved ICY metadata blocks. Until then, report no title.
  let _ = query_url(req)
  json_response(
    200,
    json.to_string(json.object([#("title", json.nullable(None, json.string))])),
  )
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
