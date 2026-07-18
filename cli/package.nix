# Shared crane build for the atradio CLI, imported by BOTH:
#   - cli/flake.nix   (standalone: `cd cli && nix build`),  src = ./.
#   - the root flake  (default package),                    src = ./cli
#
# Kept as a plain importable file (not a flake input) so neither flake needs a
# `path:` input — relative path inputs can't be locked inside a git repo and
# break `nix build` in CI ("unlocked input").
{ craneLib, pkgs, lib, src, advisory-db }:

let
  # atradio uses rustls end-to-end (no openssl) and has NO runtime binary
  # dependency (rockbox-playback decodes in-process), so the binary stands
  # alone — no wrapProgram / PATH shim.
  commonArgs = {
    inherit src;

    pname = "atradio";
    version = "0.3.0";
    strictDeps = true;

    # rockbox-playback pulls in rockbox-codecs + rockbox-dsp, whose build
    # scripts compile Rockbox's C sources with the `cc` crate — so a C compiler
    # must be on PATH. `stdenv.cc` is that toolchain (clang on Darwin, gcc on
    # Linux).
    nativeBuildInputs = [
      pkgs.pkg-config
      pkgs.stdenv.cc
      # tonic-build regenerates src/grpc/ from proto/ at build time.
      pkgs.protobuf
    ] ++ lib.optionals pkgs.stdenv.isDarwin [
      # coreaudio-sys generates its CoreAudio bindings with bindgen at build
      # time; bindgenHook provides libclang + the Nix Apple SDK.
      pkgs.rustPlatform.bindgenHook
    ];

    buildInputs = lib.optionals pkgs.stdenv.isDarwin [
      pkgs.libiconv
    ] ++ lib.optionals pkgs.stdenv.isLinux [
      # cpal links against ALSA on Linux. MPRIS needs no dbus dev lib: zbus
      # (via mpris-server) is pure Rust.
      pkgs.alsa-lib
    ];

    cargoExtraArgs = "--locked --bin atradio";
  };

  cargoArtifacts = craneLib.buildDepsOnly commonArgs;

  atradio = craneLib.buildPackage (commonArgs // {
    inherit cargoArtifacts;
    doCheck = false;

    meta = {
      description = "A TUI radio player on the AT Protocol";
      homepage = "https://github.com/tsirysndr/atradio.fm";
      # Linking rockbox-playback (GPL-2.0) makes the binary GPL-2.0+.
      license = lib.licenses.gpl2Plus;
      mainProgram = "atradio";
      platforms = lib.platforms.unix;
    };
  });

  checks = {
    inherit atradio;

    atradio-clippy = craneLib.cargoClippy (commonArgs // {
      inherit cargoArtifacts;
      cargoClippyExtraArgs = "--all-targets -- --deny warnings";
    });

    atradio-fmt = craneLib.cargoFmt { inherit src; };

    atradio-audit = craneLib.cargoAudit { inherit src advisory-db; };
  };

  devShell = pkgs.mkShell {
    inputsFrom = builtins.attrValues checks;

    # Build-time tools. pkg-config resolves libasound for cpal's build.rs on
    # Linux; stdenv.cc supplies the C compiler the rockbox-codecs / rockbox-dsp
    # build scripts need for Rockbox's C sources.
    nativeBuildInputs = with pkgs; [
      cargo
      rustc
      rustfmt
      clippy
      rust-analyzer
      pkg-config
      stdenv.cc
      protobuf # protoc for tonic-build codegen
      grpcurl # poke the gRPC control API by hand
    ];

    # Link-time libraries. pkg-config only picks up `.pc` files from
    # buildInputs, so alsa-lib MUST live here for cpal → ALSA to resolve.
    buildInputs = with pkgs; lib.optionals stdenv.isDarwin [
      libiconv
    ] ++ lib.optionals stdenv.isLinux [
      alsa-lib
    ];

    shellHook = ''
      echo "◈ atradio dev shell — $(cargo --version)"
    '';
  };
in
{
  inherit atradio checks devShell;
}
