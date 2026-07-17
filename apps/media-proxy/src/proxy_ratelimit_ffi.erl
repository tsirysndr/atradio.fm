%% A per-node fixed-window rate limiter backed by ETS atomic counters.
%%
%% Node-local, like the cache: behind a load balancer the effective limit is
%% (replicas x limit), which is fine for basic abuse protection. `ets:update_counter`
%% is atomic, so concurrent requests count correctly. A background sweep drops
%% expired windows so the table stays bounded.
-module(proxy_ratelimit_ffi).
-export([init/0, check/3]).

-define(TABLE, atradio_ratelimit).
-define(SWEEP_MS, 120000).

init() ->
    case ets:info(?TABLE) of
        undefined ->
            ets:new(?TABLE, [
                named_table, public, set, {write_concurrency, true}
            ]),
            spawn(fun sweep_loop/0);
        _ ->
            ?TABLE
    end,
    nil.

%% check(Key, Limit, WindowSeconds) -> {ok, Remaining} | {error, RetryAfter}
%% (matches Gleam Result(Int, Int)).
check(Key, Limit, WindowSeconds) ->
    Now = erlang:system_time(second),
    WindowEnd = ((Now div WindowSeconds) + 1) * WindowSeconds,
    Count = ets:update_counter(
        ?TABLE, {Key, WindowEnd}, {2, 1}, {{Key, WindowEnd}, 0}
    ),
    case Count =< Limit of
        true -> {ok, Limit - Count};
        false -> {error, WindowEnd - Now}
    end.

%% Drop entries whose window has already ended.
sweep_loop() ->
    receive
    after ?SWEEP_MS -> ok
    end,
    Now = erlang:system_time(second),
    ets:select_delete(?TABLE, [{{{'_', '$1'}, '_'}, [{'<', '$1', Now}], [true]}]),
    sweep_loop().
