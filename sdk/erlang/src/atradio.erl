%% Official Erlang SDK for atradio.fm.
%%
%% A friendly wrapper over the Rustler NIF (`atradio_nif`) bindings to the shared
%% Rust core (`atradio-sdk`). Decodes the {"ok"|"error"} JSON envelopes with the
%% OTP `json` module (OTP 27+). The auth / record / reconcile logic is identical
%% to the Rust, Go, TypeScript, Python, Ruby, and Clojure SDKs.
%%
%% Stations are maps with binary camelCase keys
%% (#{<<"stationId">> => …, <<"name">> => …, <<"streamUrl">> => …, <<"source">> => …}).
-module(atradio).

-export([recent_stations/1, recent_stations/2,
         popular_stations/1, popular_stations/2,
         global_recently_played/1, global_recently_played/2,
         favorites/2, favorites/3,
         favorite_rkey/1,
         login/3, login/4,
         favorite/2, unfavorite/2, comment/3,
         set_play_status/2, delete_play_status/1, refresh_session/1]).

%% ---- reads (unauthenticated) ----

recent_stations(Limit) -> recent_stations(Limit, <<>>).
recent_stations(Limit, Base) ->
    unwrap(atradio_nif:recent_stations(bin(Base), Limit)).

popular_stations(Limit) -> popular_stations(Limit, <<>>).
popular_stations(Limit, Base) ->
    unwrap(atradio_nif:popular_stations(bin(Base), Limit)).

global_recently_played(Limit) -> global_recently_played(Limit, <<>>).
global_recently_played(Limit, Base) ->
    unwrap(atradio_nif:global_recently_played(bin(Base), Limit)).

favorites(Actor, Limit) -> favorites(Actor, Limit, <<>>).
favorites(Actor, Limit, Base) ->
    unwrap(atradio_nif:favorites(bin(Base), bin(Actor), Limit)).

%% The deterministic favorite record key — identical across every atradio SDK.
favorite_rkey(StationId) ->
    atradio_nif:favorite_rkey(bin(StationId)).

%% ---- authenticated agent ----
%% Returns an opaque resource handle; it's released automatically by GC.

login(Session, Id, Pw) -> login(Session, Id, Pw, <<>>).
login(Session, Id, Pw, AppView) ->
    atradio_nif:agent_login(bin(Session), bin(Id), bin(Pw), bin(AppView)).

favorite(Agent, Station) ->
    unwrap(atradio_nif:agent_favorite(Agent, json_bin(Station))).

unfavorite(Agent, Station) ->
    unwrap(atradio_nif:agent_unfavorite(Agent, json_bin(Station))).

comment(Agent, Station, Text) ->
    unwrap(atradio_nif:agent_comment(Agent, json_bin(Station), bin(Text))).

set_play_status(Agent, Station) ->
    unwrap(atradio_nif:agent_set_play_status(Agent, json_bin(Station))).

delete_play_status(Agent) ->
    unwrap(atradio_nif:agent_delete_play_status(Agent)).

refresh_session(Agent) ->
    unwrap(atradio_nif:agent_refresh_session(Agent)).

%% ---- internals ----

unwrap(Json) ->
    case json:decode(Json) of
        #{<<"error">> := E} -> error({atradio, E});
        #{<<"ok">> := Ok} -> Ok;
        Other -> Other
    end.

json_bin(Term) -> iolist_to_binary(json:encode(Term)).

bin(B) when is_binary(B) -> B;
bin(L) when is_list(L) -> list_to_binary(L);
bin(A) when is_atom(A) -> atom_to_binary(A, utf8).
