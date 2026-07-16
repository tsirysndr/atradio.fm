{
  description = "atradio.fm — the CLI/TUI lives in ./cli (the default package)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    # The CLI is a self-contained sub-flake; the root re-exports it so
    # `nix build`, `nix run`, and `nix profile install github:tsirysndr/atradio.fm`
    # all resolve to the CLI. Add more sub-flakes here as the repo grows.
    cli = {
      url = "path:./cli";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-utils.follows = "flake-utils";
    };
  };

  outputs = { self, nixpkgs, flake-utils, cli, ... }:
    flake-utils.lib.eachDefaultSystem (system: {
      # Root default = the CLI (only package for now).
      packages = {
        default = cli.packages.${system}.default;
        atradio = cli.packages.${system}.default;
      };

      apps.default = cli.apps.${system}.default;

      devShells.default = cli.devShells.${system}.default;

      checks = cli.checks.${system};
    });
}
