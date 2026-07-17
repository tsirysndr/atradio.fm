%% A tiny per-node TTL cache backed by ETS, for the TuneIn (stable) and ICY
%% (per-song) responses. The proxy is stateless and horizontally scalable, so a
%% node-local cache is the right shape — no Redis dependency.
%%
%% `init/0` must run once from a long-lived process (main) so the table's owner
%% outlives requests; the mist handler processes read/write it concurrently.
-module(proxy_cache_ffi).
-export([init/0, get/1, set/3]).

-define(TABLE, atradio_media_cache).

init() ->
    case ets:info(?TABLE) of
        undefined ->
            ets:new(?TABLE, [
                named_table, public, set,
                {read_concurrency, true},
                {write_concurrency, true}
            ]);
        _ ->
            ?TABLE
    end,
    nil.

%% get(Key) -> {ok, Value} | {error, nil}   (matches Gleam Result(String, Nil))
get(Key) ->
    Now = erlang:monotonic_time(millisecond),
    case ets:lookup(?TABLE, Key) of
        [{_, Value, Expiry}] when Expiry > Now -> {ok, Value};
        [{_, _, _}] -> ets:delete(?TABLE, Key), {error, nil};
        [] -> {error, nil}
    end.

%% set(Key, Value, TtlSeconds) -> nil
set(Key, Value, TtlSeconds) ->
    Expiry = erlang:monotonic_time(millisecond) + TtlSeconds * 1000,
    ets:insert(?TABLE, {Key, Value, Expiry}),
    nil.
