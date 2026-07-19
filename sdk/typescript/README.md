# @atradio/sdk

The official **TypeScript SDK** for [atradio.fm](https://atradio.fm), built on
[atcute](https://github.com/mary-ext/atcute). It mirrors the Rust SDK
(`crates/atradio-sdk`): an `AtradioAgent` with high-level record verbs plus a
read-only `AppView` client.

## Usage

App-password (works in Node and the browser):

```ts
import { AtradioAgent } from "@atradio/sdk";

const agent = await AtradioAgent.login({
  identifier: "alice.bsky.social",
  password: "app-password",
});

await agent.favorite(station); // idempotent — deterministic record key
await agent.comment(station, "great stream 🎶");
await agent.setPlayStatus(station);

const recent = await agent.appview.recentStations(25);
const faves = await agent.appview.favorites("alice.bsky.social");
```

In the browser with an existing atcute OAuth session, wrap the client instead of
logging in:

```ts
import { AtradioAgent } from "@atradio/sdk";
const agent = AtradioAgent.fromClient(oauthClient, did);
```

Read-only, no auth:

```ts
import { AppView } from "@atradio/sdk";
const av = new AppView("https://api.atradio.fm");
const popular = await av.popularStations(50);
```

## What it gives you

- **Auth:** `AtradioAgent.login()` (app-password via atcute `CredentialManager`)
  or `AtradioAgent.fromClient()` to reuse an OAuth session. `refreshSession()`
  keep-alive.
- **Writes:** `favorite` / `unfavorite` (idempotent, deterministic record key —
  identical to the Rust SDK and web, so a station maps to one favorite
  everywhere), `comment`, `createStation`, `set/deletePlayStatus`,
  `get/putAudioSettings`, `mintServiceAuth`.
- **Reads:** `agent.appview` (or a standalone `AppView`) over the public
  `fm.atradio.*` XRPC.
- Re-exports the `@atradio/lexicons` record/type vocabulary, so this is the only
  dependency you need.

The atradio web app migrates onto this SDK (via `AtradioAgent.fromClient`).
