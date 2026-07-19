# frozen_string_literal: true

require_relative "lib/atradio"

Gem::Specification.new do |spec|
  spec.name = "atradio"
  spec.version = Atradio::VERSION
  spec.summary = "Official Ruby SDK for atradio.fm (fiddle bindings to the shared Rust core)"
  spec.authors = ["Tsiry Sandratraina"]
  spec.homepage = "https://github.com/tsirysndr/atradio.fm"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.0"

  # `fiddle` is used for FFI — stdlib on Ruby < 3.5, a default gem on 3.5+.
  spec.add_dependency "fiddle"

  # Ship the Ruby source + the download manifest, but NOT the ~11 MB native lib:
  # lib/manifest.json carries the release tag + per-triple sha256, and the loader
  # (lib/atradio/native.rb) downloads the matching prebuilt on first use,
  # verifying it against the checksum. A local ./build.sh dev build (an untracked
  # lib/libatradio_uniffi.*) is preferred over any download.
  spec.files = Dir["lib/**/*.rb", "lib/manifest.json", "README.md"]
  spec.require_paths = ["lib"]
end
