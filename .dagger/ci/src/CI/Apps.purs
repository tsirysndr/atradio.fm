module CI.Apps (arguments, check) where

import Prelude
import CI.Source as Source
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Modules as Module
import Dagger.Query as Query
import Dagger.Types (Directory)
import Effect.Aff (Aff)

arguments :: Module.Arguments { source :: Directory }
arguments = ado
  source <- Module.argument "source"
  in { source }

check :: Client -> { source :: Directory } -> Aff String
check client { source } = do
  let bun = Query.container client # Container.from "oven/bun:1.4.3"
  void $ Container.sync $ Query.container client
    # Container.from "node:24-bookworm-slim"
    # Container.withFile "/usr/local/bin/bun" (Container.file "/usr/local/bin/bun" bun)
    # Container.withExec [ "ln", "-s", "/usr/local/bin/bun", "/usr/local/bin/bunx" ]
    # Container.withMountedCache "/root/.bun/install/cache" (Query.cacheVolume "atradio-bun-1.4.3" client)
    # Container.withEnvVariable "CI" "true"
    # Source.mount source
    # Container.withWorkdir "/src"
    # Container.withExec [ "bun", "install", "--frozen-lockfile" ]
    # Container.withExec [ "bunx", "--no-install", "turbo", "run", "typecheck", "--filter=./apps/*" ]
    # Container.withExec [ "bunx", "--no-install", "turbo", "run", "test", "--filter=./apps/*" ]
  pure "App typechecks and tests passed"
