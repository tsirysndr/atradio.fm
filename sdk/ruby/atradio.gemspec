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

  spec.files = Dir["lib/**/*.rb", "README.md"]
  # NOTE: the native library (lib/libatradio_uniffi.*) is produced by build.sh
  # and is platform-specific; a real release would ship per-platform binaries.
  spec.require_paths = ["lib"]
end
