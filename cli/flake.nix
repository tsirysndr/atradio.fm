{
  description = "atradio — a TUI radio player on the AT Protocol";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    crane.url = "github:ipetkov/crane";
    flake-utils.url = "github:numtide/flake-utils";
    advisory-db = {
      url = "github:rustsec/advisory-db";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, crane, flake-utils, advisory-db, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        craneLib = crane.mkLib pkgs;

        atradio = import ./package.nix {
          inherit craneLib pkgs advisory-db;
          inherit (pkgs) lib;
          src = craneLib.cleanCargoSource ./.;
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
