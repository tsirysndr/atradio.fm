%% Streaming upstream for the audio proxy, backed by `gun`.
%%
%% This is the ~40 lines of plumbing that replace Node's `stream.pipe(res)`:
%% a dedicated "pump" process owns the gun connection, reports the response
%% headers synchronously (so mist can build the chunked response), then forwards
%% every body chunk to a Gleam `Subject` — where `stream.gleam`'s `mist.chunked`
%% loop turns each into a `send_chunk`. When the client disconnects, mist stops
%% the loop; a `stop`/timeout tears the upstream down.
-module(proxy_gun_ffi).
-export([open/2, go/2]).

-define(REDIRECT_LIMIT, 5).
-define(HEADER_TIMEOUT, 8000).
-define(GO_TIMEOUT, 30000).
-define(DATA_TIMEOUT, 20000).

%% open(Url, ReqHeaders) -> {ok, {opened, Pump, Status, Headers, Fin}}
%%                        | {error, nil}
%% Spawns a pump that opens the upstream and blocks until it has the response
%% headers, following redirects. Matches the Gleam `Opened` record + `Result`.
open(Url, ReqHeaders) ->
    _ = application:ensure_all_started(gun),
    Parent = self(),
    Pump = spawn(fun() -> pump_open(Parent, Url, ReqHeaders, ?REDIRECT_LIMIT) end),
    receive
        {headers, Pump, Status, Headers, Fin} ->
            {ok, {opened, Pump, Status, Headers, Fin}};
        {failed, Pump} ->
            {error, nil}
    after ?HEADER_TIMEOUT + 2000 ->
        Pump ! stop,
        {error, nil}
    end.

%% go(Pump, Subj) -> nil — start forwarding the body to the Gleam Subject.
go(Pump, Subj) ->
    Pump ! {go, Subj},
    nil.

pump_open(Parent, _Url, _ReqHeaders, 0) ->
    Parent ! {failed, self()};
pump_open(Parent, Url, ReqHeaders, Hops) ->
    case parse_url(Url) of
        {ok, {Scheme, Host, Port, Path}} ->
            Transport = case Scheme of <<"https">> -> tls; _ -> tcp end,
            Opts = #{transport => Transport, retry => 0,
                     tls_opts => [{verify, verify_none}]},
            case gun:open(binary_to_list(Host), Port, Opts) of
                {ok, Conn} ->
                    case gun:await_up(Conn, ?HEADER_TIMEOUT) of
                        {ok, _Proto} ->
                            Ref = gun:get(Conn, Path, ReqHeaders),
                            await_response(Parent, Url, ReqHeaders, Hops, Conn, Ref);
                        {error, _} ->
                            gun:close(Conn),
                            Parent ! {failed, self()}
                    end;
                {error, _} ->
                    Parent ! {failed, self()}
            end;
        error ->
            Parent ! {failed, self()}
    end.

await_response(Parent, Url, ReqHeaders, Hops, Conn, Ref) ->
    receive
        {gun_response, Conn, Ref, _Fin, Status, Headers}
          when Status >= 300, Status < 400 ->
            case location(Headers) of
                {ok, Loc} ->
                    gun:close(Conn),
                    pump_open(Parent, resolve(Url, Loc), ReqHeaders, Hops - 1);
                error ->
                    deliver(Parent, Conn, Ref, Status, Headers, _Fin)
            end;
        {gun_response, Conn, Ref, Fin, Status, Headers} ->
            deliver(Parent, Conn, Ref, Status, Headers, Fin);
        {gun_error, Conn, Ref, _} ->
            gun:close(Conn),
            Parent ! {failed, self()};
        {gun_down, Conn, _, _, _} ->
            Parent ! {failed, self()}
    after ?HEADER_TIMEOUT ->
        gun:close(Conn),
        Parent ! {failed, self()}
    end.

deliver(Parent, Conn, Ref, Status, Headers, Fin) ->
    FinBool = Fin =:= fin,
    Parent ! {headers, self(), Status, Headers, FinBool},
    case FinBool of
        true -> gun:close(Conn);
        false -> wait_go(Conn, Ref)
    end.

wait_go(Conn, Ref) ->
    receive
        {go, Subj} -> stream_body(Subj, Conn, Ref);
        stop -> gun:close(Conn)
    after ?GO_TIMEOUT -> gun:close(Conn)
    end.

stream_body(Subj, Conn, Ref) ->
    receive
        {gun_data, Conn, Ref, nofin, Data} ->
            send(Subj, {gun_chunk, Data}),
            stream_body(Subj, Conn, Ref);
        {gun_data, Conn, Ref, fin, Data} ->
            send(Subj, {gun_chunk, Data}),
            send(Subj, gun_eof),
            gun:close(Conn);
        {gun_error, Conn, Ref, _} ->
            send(Subj, gun_failed),
            gun:close(Conn);
        {gun_down, Conn, _, _, _} ->
            send(Subj, gun_failed);
        stop ->
            gun:close(Conn)
    after ?DATA_TIMEOUT ->
        send(Subj, gun_failed),
        gun:close(Conn)
    end.

%% Deliver to the Gleam Subject (mist's chunked-response actor owns it).
send(Subj, Msg) ->
    gleam@erlang@process:send(Subj, Msg).

location(Headers) ->
    case lists:keyfind(<<"location">>, 1, Headers) of
        {_, Loc} -> {ok, Loc};
        false -> error
    end.

parse_url(Url) ->
    case uri_string:parse(Url) of
        #{scheme := Scheme0, host := Host0} = M ->
            Scheme = to_bin(Scheme0),
            Path0 = case maps:get(path, M, <<"/">>) of
                        <<>> -> <<"/">>;
                        P -> to_bin(P)
                    end,
            Path = case maps:get(query, M, <<>>) of
                       <<>> -> Path0;
                       Q -> <<Path0/binary, "?", (to_bin(Q))/binary>>
                   end,
            Port = maps:get(port, M, default_port(Scheme)),
            {ok, {Scheme, to_bin(Host0), Port, Path}};
        _ -> error
    end.

default_port(<<"https">>) -> 443;
default_port(_) -> 80.

resolve(Base, Loc) ->
    case uri_string:parse(Loc) of
        #{scheme := _} -> Loc;                          % absolute
        _ -> to_bin(uri_string:resolve(Loc, Base))      % relative
    end.

to_bin(X) when is_binary(X) -> X;
to_bin(X) when is_list(X) -> list_to_binary(X).
