module CI.Pipeline (definitions) where

import CI.Apps as Apps
import CI.Nix as Nix
import Dagger.Modules as Module

definitions :: Array Module.ObjectDefinition
definitions =
  [ Module.object_ "ProjectCi" {}
      [ Module.function "apps" "Typecheck and test all app workspaces." Apps.arguments Apps.check
      , Module.function "nixBuild" "Build the Linux Nix package and optionally publish to Cachix." Nix.nixArgs Nix.build
      ]
  ]
