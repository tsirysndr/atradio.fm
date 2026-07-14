import { useEffect, useState } from "react";
import { useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { Spinner } from "@heroui/react";
import { consola } from "consola";
import { sessionAtom, authProfileAtom, authLoadingAtom } from "@/atoms/auth";
import { finishLogin } from "@/lib/atproto/session";
import { getProfile } from "@/lib/atproto/profile";

// The OAuth `state`/`code` is single-use: `finalizeAuthorization` consumes it.
// A module-level guard makes sure we finalize exactly once even under React
// StrictMode's double-invoked effects (which would otherwise throw "unknown
// state" on the second run).
let handled = false;

export function OAuthCallback() {
  const setSession = useSetAtom(sessionAtom);
  const setProfile = useSetAtom(authProfileAtom);
  const setLoading = useSetAtom(authLoadingAtom);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handled) return;
    handled = true;
    (async () => {
      try {
        const session = await finishLogin();
        setSession(session);
        setLoading(false);
        try {
          setProfile(await getProfile(session.info.sub));
        } catch {
          /* best-effort */
        }
        navigate({ to: "/" });
      } catch (err) {
        consola.error("[auth] callback failed", err);
        setError("Login failed. Please try again.");
      }
    })();
  }, [setSession, setProfile, setLoading, navigate]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <>
          <Spinner color="accent" size="lg" />
          <p className="text-sm text-foreground/50">Signing you in…</p>
        </>
      )}
    </div>
  );
}
