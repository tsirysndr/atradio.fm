import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { consola } from "consola";
import { sessionAtom } from "@/atoms/auth";
import { refreshSession } from "@/lib/atproto/session";

/**
 * Keeps the OAuth session rolling while the app is open.
 *
 * atcute refreshes tokens on demand (on an XRPC call), but an idle-but-open tab
 * makes no calls, so its session can drift until the refresh token itself lapses
 * — after which nothing works and the only fix is a manual re-login. This runs a
 * self-rescheduling timer that refreshes ~30s before each access token expires,
 * rotating the refresh token and pushing the session's lifetime forward. If the
 * refresh token is truly dead it clears the session so the re-login prompt shows.
 *
 * We deliberately don't write the refreshed session back to `sessionAtom` on the
 * happy path: atcute's client re-reads the store on every request, so the atom
 * only needs updating when the session *dies* (→ null). Renders nothing.
 */

/** Refresh this long before the access token expires (inside atcute's 60s skew). */
const REFRESH_BEFORE_MS = 30_000;
/** Never schedule sooner than this (avoids a busy loop near expiry). */
const MIN_DELAY_MS = 15_000;
/** …or later than this (bounds wake-ups when a token is unusually long-lived). */
const MAX_DELAY_MS = 25 * 60_000;
/** Backoff after a transient (likely network) refresh failure. */
const RETRY_DELAY_MS = 60_000;

export function SessionRefresher() {
  const session = useAtomValue(sessionAtom);
  const setSession = useSetAtom(sessionAtom);

  useEffect(() => {
    if (!session) return;
    const did = session.info.sub;
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout>;

    const clamp = (n: number) =>
      Math.min(Math.max(n, MIN_DELAY_MS), MAX_DELAY_MS);

    const delayFor = (expiresAt: number | undefined) =>
      expiresAt
        ? clamp(expiresAt * 1000 - Date.now() - REFRESH_BEFORE_MS)
        : MAX_DELAY_MS;

    const tick = async () => {
      if (cancelled) return;
      try {
        const fresh = await refreshSession(did);
        if (cancelled) return;
        if (!fresh) {
          // Refresh token dead — drop the session so the UI prompts re-login.
          setSession(null);
          return;
        }
        handle = setTimeout(tick, delayFor(fresh.token.expires_at));
      } catch (err) {
        if (cancelled) return;
        consola.warn("[atproto] proactive session refresh failed; retrying", err);
        handle = setTimeout(tick, RETRY_DELAY_MS);
      }
    };

    handle = setTimeout(tick, delayFor(session.token.expires_at));
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // Only re-arm when the identity changes (login/logout), not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.info.sub]);

  return null;
}
