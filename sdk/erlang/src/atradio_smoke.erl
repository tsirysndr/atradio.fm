%% Live read smoke test. Run via build.sh's `erl` invocation.
-module(atradio_smoke).
-export([main/0]).

main() ->
    Recent = atradio:recent_stations(3),
    First = case Recent of
                [H | _] -> maps:get(<<"name">>, maps:get(<<"station">>, H));
                _ -> <<"-">>
            end,
    io:format("recent_stations: ~p — first: ~ts~n", [length(Recent), First]),
    io:format("popular_stations: ~p~n", [length(atradio:popular_stations(3))]),
    io:format("global_recently_played: ~p~n", [length(atradio:global_recently_played(3))]),
    Rk = atradio:favorite_rkey(<<"rb:00000000-0000-0000-0000-000000000000">>),
    io:format("favorite_rkey(rb:0000…): ~ts (len ~p)~n", [Rk, byte_size(Rk)]),
    16 = byte_size(Rk),
    io:format("Erlang read smoke OK~n").
