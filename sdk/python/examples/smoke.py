"""Live read smoke test for the atradio Python SDK. Run: uv run examples/smoke.py"""

from atradio import AppView, favorite_rkey

av = AppView(None)  # None → default AppView base URL

recent = av.recent_stations(3)
print(f"recent_stations: {len(recent)} — first: {recent[0].station.name if recent else '-'}")

popular = av.popular_stations(3)
print(f"popular_stations: {len(popular)}")

play = av.global_recently_played(3)
print(f"global_recently_played: {len(play)}")

# Cross-SDK parity: the deterministic favorite key must match every other SDK.
rk = favorite_rkey("rb:00000000-0000-0000-0000-000000000000")
print(f"favorite_rkey(rb:0000…): {rk}  (len={len(rk)})")
assert len(rk) == 16, "favorite rkey must be a 16-char hex string"

print("Python read smoke OK")
