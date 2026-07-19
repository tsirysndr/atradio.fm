# frozen_string_literal: true

# Resolves the native atradio-uniffi library, downloading a prebuilt from the
# GitHub release on first use when it isn't already present locally.
#
# Order of preference:
#   1. libatradio_uniffi.<ext> next to this file — a local `./build.sh` dev build.
#   2. A checksum-verified copy in the user cache, downloaded on first load
#      (the published-gem path: the ~11 MB lib is not bundled in the gem).
#
# The gem ships lib/manifest.json (repo, release tag, one sha256 per target
# triple) — filled from the release artifacts by sdk/scripts/gen-uniffi-manifest.sh.
require "json"
require "rbconfig"
require "digest"
require "fileutils"
require "net/http"
require "uri"

module Atradio
  module Native
    module_function

    def ext
      case RbConfig::CONFIG["host_os"]
      when /darwin/ then "dylib"
      when /mswin|mingw|cygwin/ then "dll"
      else "so"
      end
    end

    def arch
      a = RbConfig::CONFIG["host_cpu"]
      case a
      when /x86_64|amd64/ then "x86_64"
      when /arm64|aarch64/ then "aarch64"
      else a
      end
    end

    # Canonical target triple matching the release asset names.
    def triple
      case RbConfig::CONFIG["host_os"]
      when /darwin/ then "#{arch}-apple-darwin"
      when /linux/ then "#{arch}-linux-gnu"
      when /freebsd/ then "#{arch}-unknown-freebsd"
      when /netbsd/ then "#{arch}-unknown-netbsd"
      when /openbsd/ then "#{arch}-unknown-openbsd"
      else raise Error, "unsupported platform: #{RbConfig::CONFIG["host_os"]}"
      end
    end

    def lib_dir
      File.expand_path("..", __dir__) # sdk/ruby/lib
    end

    def cache_dir(tag)
      base = ENV["XDG_CACHE_HOME"] || File.join(Dir.home, ".cache")
      File.join(base, "atradio", tag)
    end

    def manifest
      JSON.parse(File.read(File.join(lib_dir, "manifest.json")))
    end

    # Absolute path to a loadable native library, fetching it if necessary.
    def resolve
      local = File.join(lib_dir, "libatradio_uniffi.#{ext}")
      return local if File.exist?(local)

      m = manifest
      t = triple
      sha = m.dig("checksums", t) or
        raise Error, "no prebuilt native lib for #{t} (manifest has no checksum)"
      tag = m["tag"]
      dest = File.join(cache_dir(tag), "libatradio_uniffi-#{t}.#{ext}")
      return dest if File.exist?(dest) && Digest::SHA256.file(dest).hexdigest == sha

      download_verify(m["repo"], tag, t, sha, dest)
      dest
    end

    def download_verify(repo, tag, triple, sha, dest)
      url = "https://github.com/#{repo}/releases/download/#{tag}/libatradio_uniffi-#{triple}.#{ext}"
      body = fetch(url)
      got = Digest::SHA256.hexdigest(body)
      raise Error, "checksum mismatch for #{triple}: want #{sha}, got #{got}" unless got == sha

      FileUtils.mkdir_p(File.dirname(dest))
      tmp = "#{dest}.download"
      File.binwrite(tmp, body)
      File.chmod(0o755, tmp)
      File.rename(tmp, dest)
    end

    def fetch(url, limit = 5)
      raise Error, "too many redirects" if limit.zero?

      res = Net::HTTP.get_response(URI(url))
      case res
      when Net::HTTPSuccess then res.body
      when Net::HTTPRedirection then fetch(res["location"], limit - 1)
      else raise Error, "download failed (#{res.code}) for #{url}"
      end
    end
  end
end
