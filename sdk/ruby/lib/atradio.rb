# frozen_string_literal: true

# Official Ruby SDK for atradio.fm.
#
# A thin binding, via Ruby's stdlib `fiddle` (no `ffi` gem), to the plain C ABI
# of the shared Rust core (`atradio-uniffi` → `atradio-sdk`). The auth / record /
# reconcile logic is identical to the Rust, Go, TypeScript, and Python SDKs.
require "fiddle"
require "fiddle/import"
require "json"
require "rbconfig"

module Atradio
  VERSION = "0.1.0"

  lib_name =
    case RbConfig::CONFIG["host_os"]
    when /darwin/ then "libatradio_uniffi.dylib"
    when /mswin|mingw|cygwin/ then "atradio_uniffi.dll"
    else "libatradio_uniffi.so"
    end
  LIB_PATH = File.expand_path(lib_name, __dir__)

  # Raised when the core returns an `{"error": …}` envelope.
  class Error < StandardError; end

  module C
    extend Fiddle::Importer
    dlload Atradio::LIB_PATH
    [
      "char* atradio_recent_stations(const char*, unsigned int)",
      "char* atradio_popular_stations(const char*, unsigned int)",
      "char* atradio_global_recently_played(const char*, unsigned int)",
      "char* atradio_favorites(const char*, const char*, unsigned int)",
      "char* atradio_favorite_rkey(const char*)",
      "void atradio_string_free(void*)",
      "void* atradio_agent_login(const char*, const char*, const char*, const char*)",
      "char* atradio_last_error()",
      "void atradio_agent_free(void*)",
      "char* atradio_agent_favorite(void*, const char*)",
      "char* atradio_agent_unfavorite(void*, const char*)",
      "char* atradio_agent_comment(void*, const char*, const char*)",
      "char* atradio_agent_set_play_status(void*, const char*)",
      "char* atradio_agent_delete_play_status(void*)",
      "char* atradio_agent_refresh_session(void*)"
    ].each { |sig| extern sig }
  end
  private_constant :C

  # C strings the core returns aren't length-tagged, so resolve their length
  # with libc `strlen`.
  STRLEN = Fiddle::Function.new(
    Fiddle::Handle::DEFAULT["strlen"], [Fiddle::TYPE_VOIDP], Fiddle::TYPE_SIZE_T
  )
  private_constant :STRLEN

  # Copy an owned C string into a Ruby string and free the original.
  def self.take_string(ptr)
    return nil if ptr.nil? || ptr.null?

    len = STRLEN.call(ptr)
    str = ptr[0, len].force_encoding("UTF-8")
    C.atradio_string_free(ptr)
    str
  end

  # Parse a `{"ok"|"error"}` envelope, raising Error on failure.
  def self.unwrap(ptr)
    parsed = JSON.parse(take_string(ptr))
    raise Error, parsed["error"] if parsed.key?("error")

    parsed["ok"]
  end

  # ---- reads (unauthenticated) ----

  def self.recent_stations(limit = 50, base: nil)
    unwrap(C.atradio_recent_stations(base.to_s, limit))
  end

  def self.popular_stations(limit = 50, base: nil)
    unwrap(C.atradio_popular_stations(base.to_s, limit))
  end

  def self.global_recently_played(limit = 50, base: nil)
    unwrap(C.atradio_global_recently_played(base.to_s, limit))
  end

  def self.favorites(actor, limit = 50, base: nil)
    unwrap(C.atradio_favorites(base.to_s, actor, limit))
  end

  # The deterministic favorite record key — identical across every atradio SDK.
  def self.favorite_rkey(station_id)
    take_string(C.atradio_favorite_rkey(station_id))
  end

  # ---- authenticated agent ----
  #
  # Stations are passed as Hashes with camelCase keys (stationId, name,
  # streamUrl, source, …), matching the wire record shape.
  class Agent
    def self.login(session_path, identifier, password, appview: nil)
      ptr = C.atradio_agent_login(session_path, identifier, password, appview.to_s)
      if ptr.null?
        raise Error, (Atradio.take_string(C.atradio_last_error()) || "login failed")
      end

      new(ptr)
    end

    def initialize(ptr)
      @ptr = ptr
    end

    def favorite(station)
      Atradio.unwrap(C.atradio_agent_favorite(@ptr, JSON.generate(station)))
    end

    def unfavorite(station)
      Atradio.unwrap(C.atradio_agent_unfavorite(@ptr, JSON.generate(station)))
    end

    def comment(station, text)
      Atradio.unwrap(C.atradio_agent_comment(@ptr, JSON.generate(station), text))
    end

    def set_play_status(station)
      Atradio.unwrap(C.atradio_agent_set_play_status(@ptr, JSON.generate(station)))
    end

    def delete_play_status
      Atradio.unwrap(C.atradio_agent_delete_play_status(@ptr))
    end

    def refresh_session
      Atradio.unwrap(C.atradio_agent_refresh_session(@ptr))
    end

    # Release the native handle. The agent is unusable afterwards.
    def close
      return if @ptr.null?

      C.atradio_agent_free(@ptr)
      @ptr = Fiddle::Pointer.new(0)
    end
  end
end
