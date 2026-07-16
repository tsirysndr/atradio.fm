{
  description = "atradio — a TUI radio player on the AT Protocol";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # Current crane doesn't expose a `nixpkgs` input, so we don't follow it.
    crane.url = "github:ipetkov/crane";

    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.rust-analyzer-src.follows = "";
    };

    flake-utils.url = "github:numtide/flake-utils";

    advisory-db = {
      url = "github:rustsec/advisory-db";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, crane, fenix, flake-utils, advisory-db, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        inherit (pkgs) lib;

        craneLib = crane.mkLib pkgs;

        src = craneLib.cleanCargoSource ./.;

        # atradio uses rustls end-to-end, so no openssl. Unlike the web build it
        # has NO runtime binary dependency (rockbox-playback decodes in-process),
        # so there is no wrapProgram/PATH shim — the binary stands alone.
        commonArgs = {
          inherit src;

          pname = "atradio";
          version = "0.1.0";
          strictDeps = true;

          # rockbox-playback pulls in rockbox-codecs + rockbox-dsp, whose build
          # scripts compile Rockbox's C codec/DSP sources with the `cc` crate —
          # so a C compiler must be on PATH. `stdenv.cc` is that toolchain
          # (clang on Darwin, gcc on Linux).
          nativeBuildInputs = [
            pkgs.pkg-config
            pkgs.stdenv.cc
          ] ++ lib.optionals pkgs.stdenv.isDarwin [
            # coreaudio-sys generates its CoreAudio bindings with bindgen at
            # build time; bindgenHook provides libclang + the Nix Apple SDK.
            pkgs.rustPlatform.bindgenHook
          ];

          buildInputs = lib.optionals pkgs.stdenv.isDarwin [
            pkgs.libiconv
          ] ++ lib.optionals pkgs.stdenv.isLinux [
            # cpal links against ALSA on Linux for the audio output path.
            # MPRIS needs no dbus dev lib: zbus (via mpris-server) is pure Rust.
            pkgs.alsa-lib
          ];

          # Single bin target.
          cargoExtraArgs = "--locked --bin atradio";
        };

        craneLibLLvmTools = craneLib.overrideToolchain
          (fenix.packages.${system}.complete.withComponents [
            "cargo"
            "llvm-tools"
            "rustc"
          ]);

        # Cache the dependency graph separately from the crate source.
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

      in
      {
        checks = {
          inherit atradio;

          atradio-clippy = craneLib.cargoClippy (commonArgs // {
            inherit cargoArtifacts;
            cargoClippyExtraArgs = "--all-targets -- --deny warnings";
          });

          atradio-fmt = craneLib.cargoFmt {
            inherit src;
          };

          atradio-audit = craneLib.cargoAudit {
            inherit src advisory-db;
          };
        };

        packages = {
          default = atradio;
          atradio = atradio;

          atradio-llvm-coverage = craneLibLLvmTools.cargoLlvmCov (commonArgs // {
            inherit cargoArtifacts;
          });
        };

        apps.default = flake-utils.lib.mkApp {
          drv = atradio;
          name = "atradio";
        };

        devShells.default = pkgs.mkShell {
          inputsFrom = builtins.attrValues self.checks.${system};

          # Build-time tools. pkg-config resolves libasound for cpal's build.rs
          # on Linux; stdenv.cc supplies the C compiler the rockbox-codecs /
          # rockbox-dsp build scripts need for Rockbox's C sources.
          nativeBuildInputs = with pkgs; [
            cargo
            rustc
            rustfmt
            clippy
            rust-analyzer
            pkg-config
            stdenv.cc
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
      });
}
