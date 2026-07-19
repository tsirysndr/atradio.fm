# Live read smoke test for the atradio Ruby SDK. Run: ruby examples/smoke.rb
$LOAD_PATH.unshift File.expand_path("../lib", __dir__)
require "atradio"

recent = Atradio.recent_stations(3)
puts "recent_stations: #{recent.size} — first: #{recent.first&.dig('station', 'name')}"

popular = Atradio.popular_stations(3)
puts "popular_stations: #{popular.size}"

play = Atradio.global_recently_played(3)
puts "global_recently_played: #{play.size}"

# Cross-SDK parity: the deterministic favorite key must match every other SDK.
rk = Atradio.favorite_rkey("rb:00000000-0000-0000-0000-000000000000")
puts "favorite_rkey(rb:0000…): #{rk} (len=#{rk.length})"
raise "favorite rkey must be 16-char hex" unless rk.length == 16

puts "Ruby read smoke OK"
