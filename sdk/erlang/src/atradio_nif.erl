%% Raw NIF module: loads the Rustler-built native library and declares the NIF
%% stubs. Each function is replaced by the native implementation on load; the
%% Erlang bodies only run if loading failed. Reads/writes return JSON binaries
%% ({"ok"|"error"} envelopes); favorite_rkey returns the key binary directly.
%%
%% Prefer the friendly `atradio` module over calling these directly.
-module(atradio_nif).

-export([recent_stations/2, popular_stations/2, global_recently_played/2,
         favorites/3, favorite_rkey/1, agent_login/4, agent_favorite/2,
         agent_unfavorite/2, agent_comment/3, agent_set_play_status/2,
         agent_delete_play_status/1, agent_refresh_session/1]).

-on_load(init/0).

init() ->
    Dir = filename:dirname(code:which(?MODULE)),
    Path = filename:join([Dir, "..", "priv", "atradio_nif"]),
    erlang:load_nif(Path, 0).

-define(NOT_LOADED, erlang:nif_error(atradio_nif_not_loaded)).

recent_stations(_Base, _Limit) -> ?NOT_LOADED.
popular_stations(_Base, _Limit) -> ?NOT_LOADED.
global_recently_played(_Base, _Limit) -> ?NOT_LOADED.
favorites(_Base, _Actor, _Limit) -> ?NOT_LOADED.
favorite_rkey(_StationId) -> ?NOT_LOADED.
agent_login(_Session, _Id, _Pw, _AppView) -> ?NOT_LOADED.
agent_favorite(_Agent, _StationJson) -> ?NOT_LOADED.
agent_unfavorite(_Agent, _StationJson) -> ?NOT_LOADED.
agent_comment(_Agent, _StationJson, _Text) -> ?NOT_LOADED.
agent_set_play_status(_Agent, _StationJson) -> ?NOT_LOADED.
agent_delete_play_status(_Agent) -> ?NOT_LOADED.
agent_refresh_session(_Agent) -> ?NOT_LOADED.
