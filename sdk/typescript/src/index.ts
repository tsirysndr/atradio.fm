/**
 * `@atradio/sdk` — the official TypeScript SDK for atradio.fm, built on
 * [atcute](https://github.com/mary-ext/atcute).
 *
 * ```ts
 * import { AtradioAgent } from "@atradio/sdk";
 *
 * const agent = await AtradioAgent.login({
 *   identifier: "alice.bsky.social",
 *   password: "app-password",
 * });
 * await agent.favorite(station);            // idempotent
 * const recent = await agent.appview.recentStations(25);
 * ```
 *
 * In the browser with an existing OAuth session, wrap the atcute client:
 * `AtradioAgent.fromClient(client, did)`.
 */
export { AtradioAgent } from "./agent.ts";
export type { AgentOptions, LoginOptions, StoredStation } from "./agent.ts";
export { AppView } from "./appview.ts";
export type { PopularItem } from "./appview.ts";
export { favoriteRkey } from "./favorite-rkey.ts";

// Re-export the record/type vocabulary so consumers need only one dependency.
export * from "@atradio/lexicons";
