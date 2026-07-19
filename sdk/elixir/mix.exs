defmodule Atradio.MixProject do
  use Mix.Project

  @version "0.1.0"
  @source_url "https://github.com/tsirysndr/atradio.fm"
  @source_ref "bindings-v0.1.0"

  def project do
    [
      app: :atradio_ex,
      version: @version,
      elixir: "~> 1.15",
      deps: deps(),
      description:
        "Official Elixir SDK for atradio.fm — a thin wrapper over the atradio_erl NIF package.",
      package: package(),
      name: "atradio_ex",
      source_url: @source_url,
      docs: docs()
    ]
  end

  def application, do: [extra_applications: []]

  defp deps do
    [
      {:atradio_erl, atradio_erl_dep()},
      {:ex_doc, "~> 0.34", only: :dev, runtime: false}
    ]
  end

  # Depend on the published NIF package (it downloads the native lib on first
  # load). For monorepo dev against an unpublished local build, set
  # ATRADIO_ERL_PATH=../erlang.
  defp atradio_erl_dep do
    case System.get_env("ATRADIO_ERL_PATH") do
      nil -> "~> 0.1"
      path -> [path: path]
    end
  end

  defp docs do
    [
      main: "readme",
      extras: ["README.md"],
      source_url: @source_url,
      source_ref: @source_ref,
      # This package lives in a monorepo subdirectory, so ExDoc's source links
      # must be prefixed with sdk/elixir/.
      source_url_pattern: "#{@source_url}/blob/#{@source_ref}/sdk/elixir/%{path}#L%{line}"
    ]
  end

  defp package do
    [
      licenses: ["MIT"],
      # Only the Elixir wrappers ship; the native NIF comes via atradio_erl.
      files: ~w(lib mix.exs README.md),
      links: %{"GitHub" => @source_url}
    ]
  end
end
