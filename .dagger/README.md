# Atradio CI with PureScript and Dagger

GitHub Actions selects runners and triggers; `.dagger/ci` owns the Linux CI
commands. The module uses Dagger v1.0.0-beta.21 and the vendored MIT-licensed
PureScript SDK in `sdk/purescript`. No sibling SDK checkout is required.

## Pipelines

| Function | Work |
| --- | --- |
| `apps` | Node 24, Bun 1.4.3, frozen install, Turbo typechecks and tests for `./apps/*` |
| `nix-build` | Build the root default flake package on the runner's Linux architecture; use the public `atradio` Cachix cache and upload when a token is supplied |

The apps pipeline includes the web, API, mobile app's JavaScript checks, and
TypeScript media proxy tasks selected by Turbo. It does not build native mobile
applications. `package.json` pins the same Bun version used by the pipeline.

From this directory, with the Dagger CLI installed:

```sh
dagger api call -m ci apps --source ..

# An empty token uses the public cache without uploading.
export CACHIX_AUTH_TOKEN=''
dagger api call -m ci nix-build --source .. \
  --cachix-token env://CACHIX_AUTH_TOKEN --run-id local
```

Use a unique run ID for a fresh cache initialization/publication operation.
GitHub supplies its run ID and attempt. Fork pull requests build with the public
cache and skip uploads when no secret is available. Tokens use Dagger secrets.

`Main.purs` only starts the runtime. `CI.Pipeline` registers functions,
`CI.Apps` and `CI.Nix` implement them, `CI.Source` filters host inputs, and
`CI.Runtime` reports complete engine errors. The SDK container installs the
PureScript compiler and Spago; contributors do not need them for Dagger calls.
The SDK bootstraps core bindings on clean checkouts and generates schema bindings
when introspection is supplied. See `sdk/purescript/VENDORED.md` for provenance.

Bun downloads and the Nix store use Dagger cache volumes. There are no GitHub
Actions volume snapshot or restore steps. Native macOS/BSD release builds,
native binding releases, macOS Nix, and FlakeHub OIDC publication retain their
existing workflows. The Linux Nix function builds the same default package as
the old job; it does not introduce extra flake checks.

For a lightweight diagnostic regression check:

```sh
node --test ci/runtime.test.mjs
```

Full container execution runs in GitHub Actions. Update the vendored SDK only
with a reviewed snapshot, preserving its Node 24 and HTTP transport patches.
