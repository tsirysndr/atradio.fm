import { useEffect } from "react";
import { useSetAtom } from "jotai";
import {
  sessionAtom,
  authProfileAtom,
  authLoadingAtom,
} from "@/atoms/auth";
import { restoreSession } from "@/lib/atproto/session";
import { getProfile } from "@/lib/atproto/profile";

/** Restores any stored OAuth session on app start; renders nothing. */
export function AuthInitializer() {
  const setSession = useSetAtom(sessionAtom);
  const setProfile = useSetAtom(authProfileAtom);
  const setLoading = useSetAtom(authLoadingAtom);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await restoreSession();
      if (cancelled) return;
      setSession(session);
      if (session) {
        try {
          const profile = await getProfile(session.info.sub);
          if (!cancelled) setProfile(profile);
        } catch {
          /* profile is best-effort */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setSession, setProfile, setLoading]);

  return null;
}
