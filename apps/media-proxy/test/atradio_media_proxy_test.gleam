import envoy
import gleam/option.{None, Some}
import gleeunit
import gleeunit/should
import media_proxy/config
import media_proxy/playlist

pub fn main() -> Nil {
  gleeunit.main()
}

// ---- config.port (PORT env var) --------------------------------------------

pub fn port_defaults_when_unset_test() {
  envoy.unset("PORT")
  config.port() |> should.equal(config.default_port)
  config.default_port |> should.equal(7081)
}

pub fn port_reads_env_test() {
  envoy.set("PORT", "9123")
  config.port() |> should.equal(9123)
  envoy.unset("PORT")
}

pub fn port_falls_back_on_garbage_test() {
  envoy.set("PORT", "not-a-number")
  config.port() |> should.equal(config.default_port)
  envoy.unset("PORT")
}

// ---- playlist classification -----------------------------------------------

pub fn unwrappable_playlists_test() {
  playlist.is_unwrappable("http://host/stream.pls") |> should.be_true
  playlist.is_unwrappable("https://host/stream.m3u") |> should.be_true
  playlist.is_unwrappable("https://host/stream.PLS?x=1") |> should.be_true
}

pub fn hls_is_not_unwrappable_test() {
  // .m3u8 segment URIs resolve against the manifest — must never be unwrapped.
  playlist.is_unwrappable("https://host/live.m3u8") |> should.be_false
  playlist.is_unwrappable("https://host/live.m3u8?t=1") |> should.be_false
}

pub fn direct_streams_are_not_playlists_test() {
  playlist.is_unwrappable("https://host/stream.aac") |> should.be_false
  playlist.is_unwrappable("https://host/stream") |> should.be_false
}

pub fn is_playlist_includes_hls_test() {
  playlist.is_playlist("https://host/live.m3u8") |> should.be_true
  playlist.is_playlist("https://host/x.pls") |> should.be_true
  playlist.is_playlist("https://host/stream.aac") |> should.be_false
}

// ---- playlist unwrapping ---------------------------------------------------

pub fn first_url_from_pls_test() {
  let body = "[playlist]\nNumberOfEntries=1\nFile1=http://host/real.mp3\n"
  playlist.first_stream_url(body) |> should.equal(Some("http://host/real.mp3"))
}

pub fn first_url_from_m3u_test() {
  let body = "#EXTM3U\n#EXTINF:-1,Station\nhttps://host/stream\r\n"
  playlist.first_stream_url(body) |> should.equal(Some("https://host/stream"))
}

pub fn first_url_none_when_empty_test() {
  playlist.first_stream_url("#EXTM3U\n# nothing here\n") |> should.equal(None)
}
