module CI.Source (mount) where

import Native.Container as Container
import Native.Types (Container, Directory)
import Data.Maybe (Maybe(..))

mount :: Directory -> Container -> Container
mount source = Container.withDirectoryWith "/src" source
  (Container.defaultWithDirectoryOpts
    { exclude = Just
        [ ".git", ".dagger", "**/node_modules", "**/target", "**/.turbo"
        , "**/.env", "**/.env.*", "result", "result-*"
        ]
    })
