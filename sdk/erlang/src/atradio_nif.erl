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
    Base = filename:join(nif_dir(), "atradio_nif"),
    SoPath =
        case target_triple() of
            undefined -> Base;
            Target -> resolve_nif(Base, Target)
        end,
    erlang:load_nif(SoPath, 0).

%% Resolve the extension-less path handed to load_nif (which appends the OS
%% suffix). Order of preference:
%%   1. priv/atradio_nif-<triple>.so  — a CI-built, per-triple artifact
%%   2. priv/atradio_nif.so           — a local `./build.sh` dev build
%%   3. a checksum-verified copy in the user cache, downloaded on first use
%%      (the Hex path — the .so is too large to bundle in the 8 MB tarball).
resolve_nif(Base, Target) ->
    Suffixed = Base ++ "-" ++ Target,
    case filelib:is_regular(Suffixed ++ ".so") of
        true ->
            Suffixed;
        false ->
            case filelib:is_regular(Base ++ ".so") of
                true ->
                    Base;
                false ->
                    case ensure_cached(Target) of
                        {ok, Path} -> Path;
                        {error, _} -> Base   %% load_nif fails -> stubs raise
                    end
            end
    end.

%% Directory holding the NIF .so — the app's priv when installed, or ../priv
%% relative to the .beam for a raw monorepo build.
nif_dir() ->
    case code:priv_dir(atradio) of
        {error, _} ->
            case code:which(?MODULE) of
                Beam when is_list(Beam) ->
                    filename:join([filename:dirname(Beam), "..", "priv"]);
                _ ->
                    "priv"
            end;
        Dir ->
            Dir
    end.

%% Canonical target triple matching the priv/atradio_nif-<triple>.so release
%% asset names. `undefined` on a platform we don't ship a prebuilt for.
target_triple() ->
    Arch = normalize_arch(hd(string:lexemes(
        erlang:system_info(system_architecture), "-"))),
    case os:type() of
        {unix, darwin} -> Arch ++ "-apple-darwin";
        {unix, linux} -> Arch ++ "-linux-gnu";
        {unix, freebsd} -> Arch ++ "-unknown-freebsd";
        {unix, netbsd} -> Arch ++ "-unknown-netbsd";
        {unix, openbsd} -> Arch ++ "-unknown-openbsd";
        _ -> undefined
    end.

normalize_arch("amd64") -> "x86_64";
normalize_arch("arm64") -> "aarch64";
normalize_arch(Arch) -> Arch.

%% --- First-use NIF download (the Hex path) ------------------------------------
%% The Hex package ships priv/atradio_nif.manifest (repo, release tag and one
%% sha256 per target triple) instead of the multi-megabyte .so files. On first
%% load the matching NIF is fetched from the GitHub release into the user cache
%% dir, verified against the manifest checksum, and reused thereafter.
ensure_cached(Target) ->
    case read_manifest() of
        {error, R} ->
            {error, R};
        {ok, Terms} ->
            case {manifest_tag(Terms), manifest_checksum(Terms, Target)} of
                {undefined, _} -> {error, no_tag};
                {_, undefined} -> {error, {no_checksum, Target}};
                {Tag, Sha} ->
                    Repo = manifest_repo(Terms),
                    File = "atradio_nif-" ++ Target ++ ".so",
                    Dir = filename:join(cache_root(), Tag),
                    Dest = filename:join(Dir, File),
                    ExtLess = filename:join(Dir, "atradio_nif-" ++ Target),
                    case filelib:is_regular(Dest) of
                        true ->
                            {ok, ExtLess};
                        false ->
                            Url = "https://github.com/" ++ Repo ++
                                  "/releases/download/" ++ Tag ++ "/" ++ File,
                            case fetch_verify_write(Url, Dest, Dir, Sha) of
                                ok -> {ok, ExtLess};
                                {error, R} -> {error, R}
                            end
                    end
            end
    end.

read_manifest() ->
    file:consult(filename:join(nif_dir(), "atradio_nif.manifest")).

manifest_tag(Terms) ->
    case lists:keyfind(tag, 1, Terms) of {tag, V} -> V; false -> undefined end.

manifest_repo(Terms) ->
    case lists:keyfind(repo, 1, Terms) of
        {repo, V} -> V;
        false -> "tsirysndr/atradio.fm"
    end.

manifest_checksum(Terms, Target) ->
    case [S || {checksum, T, S} <- Terms, T =:= Target] of
        [Sha | _] -> Sha;
        [] -> undefined
    end.

cache_root() ->
    filename:basedir(user_cache, "atradio").

fetch_verify_write(Url, Dest, Dir, Sha) ->
    _ = application:ensure_all_started(crypto),
    _ = application:ensure_all_started(inets),
    _ = application:ensure_all_started(ssl),
    HttpOpts = [{timeout, 120000}, {connect_timeout, 15000},
                {autoredirect, true}, {ssl, tls_opts()}],
    Req = {Url, [{"user-agent", "atradio-erlang"}]},
    case httpc:request(get, Req, HttpOpts, [{body_format, binary}]) of
        {ok, {{_, 200, _}, _Hdrs, Body}} ->
            case sha256_hex(Body) of
                Sha ->
                    ok = filelib:ensure_dir(filename:join(Dir, "keep")),
                    Tmp = Dest ++ ".download",
                    case file:write_file(Tmp, Body) of
                        ok ->
                            _ = file:change_mode(Tmp, 8#755),
                            file:rename(Tmp, Dest);
                        {error, R} -> {error, R}
                    end;
                Got ->
                    {error, {checksum_mismatch, [{want, Sha}, {got, Got}]}}
            end;
        {ok, {{_, Code, _}, _, _}} -> {error, {http_status, Code}};
        {error, R} -> {error, R}
    end.

%% Verify the TLS chain when the platform exposes the OS trust store (OTP 25+),
%% else skip peer verification — payload integrity is guaranteed by the sha256
%% check regardless, since the checksum ships inside the signed Hex tarball.
tls_opts() ->
    try public_key:cacerts_get() of
        Certs ->
            [{verify, verify_peer}, {depth, 99}, {cacerts, Certs},
             {customize_hostname_check,
              [{match_fun, public_key:pkix_verify_hostname_match_fun(https)}]}]
    catch
        _:_ -> [{verify, verify_none}]
    end.

sha256_hex(Bin) ->
    lists:flatten([io_lib:format("~2.16.0b", [B])
                   || <<B>> <= crypto:hash(sha256, Bin)]).

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
