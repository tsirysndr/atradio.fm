defmodule Atradio do
  @moduledoc """
  Official Elixir SDK for atradio.fm.

  A thin wrapper over the `:atradio_erl` NIF package (the shared Rust core):
  AppView reads, record writes, and the deterministic favorite key — identical
  to the Rust, Go, TypeScript, Python, Ruby, and Clojure SDKs. `:atradio_erl`
  downloads the matching native library from the GitHub release on first use.

  Reads return lists/maps with binary keys (the wire shape). Stations passed to
  the write verbs are maps with binary keys — `"stationId"`, `"name"`,
  `"streamUrl"`, `"source"`.

      iex> Atradio.recent_stations(5) |> Enum.map(& &1["station"]["name"])
      iex> Atradio.favorite_rkey("rb:...")   # 16-char hex, matches every SDK
  """

  # ---- reads (unauthenticated) --------------------------------------------

  @doc "Newest stations platform-wide."
  def recent_stations(limit \\ 50, base \\ ""),
    do: :atradio.recent_stations(limit, to_bin(base))

  @doc "Most-favorited stations platform-wide."
  def popular_stations(limit \\ 50, base \\ ""),
    do: :atradio.popular_stations(limit, to_bin(base))

  @doc "Platform-wide who's-listening feed."
  def global_recently_played(limit \\ 50, base \\ ""),
    do: :atradio.global_recently_played(limit, to_bin(base))

  @doc "An actor's favorited stations."
  def favorites(actor, limit \\ 50, base \\ ""),
    do: :atradio.favorites(to_bin(actor), limit, to_bin(base))

  @doc "The deterministic favorite record key — identical across every atradio SDK."
  def favorite_rkey(station_id), do: :atradio.favorite_rkey(to_bin(station_id))

  # ---- authenticated agent -------------------------------------------------

  @doc """
  Log in with an app password, persisting the session at `session_path`.
  Returns an opaque agent handle (a resource freed by GC).
  """
  def login(session_path, identifier, password, appview \\ ""),
    do:
      :atradio.login(
        to_bin(session_path),
        to_bin(identifier),
        to_bin(password),
        to_bin(appview)
      )

  @doc "Favorite a station (idempotent; deterministic record key)."
  def favorite(agent, station), do: :atradio.favorite(agent, station)

  @doc "Unfavorite a station (removes every record for its stationId)."
  def unfavorite(agent, station), do: :atradio.unfavorite(agent, station)

  @doc "Post a comment on a station."
  def comment(agent, station, text), do: :atradio.comment(agent, station, to_bin(text))

  @doc "Update the actor's play-status singleton."
  def set_play_status(agent, station), do: :atradio.set_play_status(agent, station)

  @doc "Delete the actor's play-status singleton."
  def delete_play_status(agent), do: :atradio.delete_play_status(agent)

  @doc "Proactively refresh the session (keep-alive)."
  def refresh_session(agent), do: :atradio.refresh_session(agent)

  defp to_bin(s) when is_binary(s), do: s
  defp to_bin(s), do: to_string(s)
end
