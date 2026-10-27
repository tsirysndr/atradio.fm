module CI.Nix (nixArgs, build) where

import Prelude
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Modules as Module
import Dagger.Query as Query
import Dagger.Types (Directory, Secret)
import CI.Source as Source
import Dagger.Secret as Secret
import Data.String (trim)
import Effect.Aff (Aff)

type NixArgs = { source :: Directory, cachixToken :: Secret, runId :: String }

nixArgs :: Module.Arguments NixArgs
nixArgs = ado
  source <- Module.argument "source"
  cachixToken <- Module.argument "cachixToken"
  runId <- Module.argument "runId"
  in { source, cachixToken, runId }

build :: Client -> NixArgs -> Aff String
build client args = do
  let
    image = Query.container client # Container.from "nixos/nix:2.28.5"
    store = Query.cacheVolume "atradio-nix-store" client
    -- The cache also contains Nix itself; seed it before mounting over /nix.
    seed = Query.container client
      # Container.from "node:24-bookworm-slim"
      # Container.withDirectory "/seed" (Container.directory "/nix" image)
      # Container.withMountedCache "/nix" store
      # Container.withEnvVariable "NIX_RUN" args.runId
      # Container.withExec [ "cp", "-an", "/seed/.", "/nix/" ]
  void $ Container.sync seed
  let
    environment = image
      # Container.withMountedCache "/nix" store
      # Container.withEnvVariable "NIX_REMOTE" "local"
      # Container.withEnvVariable "NIX_CONFIG" "experimental-features = nix-command flakes\nsandbox = false\nbuild-users-group =\n"
      # Container.withEnvVariable "NIX_PATH" "nixpkgs=channel:nixos-unstable"
      # Source.mount args.source
      # Container.withSecretVariable "CACHIX_AUTH_TOKEN" args.cachixToken
      # Container.withEnvVariable "NIX_RUN" args.runId
  cachix <- trim <$> Container.stdout (environment
    # Container.withWorkdir "/src"
    # Container.withExec [ "nix", "build", "--inputs-from", ".", "nixpkgs#cachix", "--no-link", "--print-out-paths" ])
  let configured = environment
        # Container.withWorkdir "/src"
        # Container.withExec [ cachix <> "/bin/cachix", "use", "atradio" ]
      built = configured # Container.withExec
        [ "nix", "build", ".#default", "-L", "--accept-flake-config" ]
  token <- Secret.plaintext args.cachixToken
  void $ Container.sync $ if token == "" then built
    else built # Container.withExec [ cachix <> "/bin/cachix", "push", "atradio", "./result" ]
  pure "Nix build completed"
