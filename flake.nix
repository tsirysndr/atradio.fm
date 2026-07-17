{
  description = "atradio.fm — the CLI/TUI lives in ./cli (the default package)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    crane.url = "github:ipetkov/crane";
    flake-utils.url = "github:numtide/flake-utils";
    advisory-db = {
      url = "github:rustsec/advisory-db";
      flake = false;
    };
  };

  # The root default package IS the CLI. We build it directly from the ./cli
  # source (sharing cli/package.nix with cli/flake.nix) rather than importing
  # the sub-flake — a `path:./cli` input can't be locked inside a git repo.
  outputs = { self, nixpkgs, crane, flake-utils, advisory-db, ... }:
    # x86_64-darwin is no longer supported on FlakeHub — build the other three.
    flake-utils.lib.eachSystem [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
    ] (system:
      let
        pkgs = import nixpkgs { inherit system; };
        craneLib = crane.mkLib pkgs;

        atradio = import ./cli/package.nix {
          inherit craneLib pkgs advisory-db;
          inherit (pkgs) lib;
          # crane's default filter keeps only Rust/Cargo files; also keep the
          # systemd unit + rc.d scripts the binary embeds via include_str!.
          src = pkgs.lib.cleanSourceWith {
            src = ./cli;
            filter = path: type:
              (craneLib.filterCargoSources path type)
              || (pkgs.lib.hasSuffix ".service" path)
              || (pkgs.lib.hasSuffix ".rc" path);
          };
        };
      in
      {
        checks = atradio.checks;

        packages = {
          default = atradio.atradio;
          atradio = atradio.atradio;
        };

        apps.default = flake-utils.lib.mkApp {
          drv = atradio.atradio;
          name = "atradio";
        };

        devShells.default = atradio.devShell;
      });
}
