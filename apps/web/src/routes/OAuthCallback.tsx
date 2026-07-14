import { useEffect, useState } from "react";
import { useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { Spinner } from "@heroui/react";
import { consola } from "consola";
import { sessionAtom, authProfileAtom, authLoadingAtom } from "@/atoms/auth";
import { finishLogin } from "@/lib/atproto/session";
import { getProfile } from "@/lib/atproto/profile";

export function OAuthCallback() {
  const setSession = useSetAtom(sessionAtom);
  const setProfile = useSetAtom(authProfileAtom);
  const setLoading = useSetAtom(authLoadingAtom);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await finishLogin();
        if (cancelled) return;
        setSession(session);
        setLoading(false);
        try {
          const profile = await getProfile(session.info.sub);
          if (!cancelled) setProfile(profile);
        } catch {
          /* best-effort */
        }
        navigate({ to: "/" });
      } catch (err) {
        consola.error("[auth] callback failed", err);
        if (!cancelled) setError("Login failed. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
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
