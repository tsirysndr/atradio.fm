import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { consola } from "consola";
import {
  sessionAtom,
  authProfileAtom,
  authLoadingAtom,
  didAtom,
  isLoggedInAtom,
} from "@/atoms/auth";
import { loginModalOpenAtom } from "@/atoms/ui";
import { endSession } from "@/lib/atproto/session";

export function useAuth() {
  const session = useAtomValue(sessionAtom);
  const setSession = useSetAtom(sessionAtom);
  const setProfile = useSetAtom(authProfileAtom);
  const profile = useAtomValue(authProfileAtom);
  const did = useAtomValue(didAtom);
  const isLoggedIn = useAtomValue(isLoggedInAtom);
  const loading = useAtomValue(authLoadingAtom);
  const openLogin = useSetAtom(loginModalOpenAtom);

  const logout = useCallback(async () => {
    if (session) await endSession(session);
    setSession(null);
    setProfile(null);
    consola.info("[auth] signed out");
  }, [session, setSession, setProfile]);

  return { isLoggedIn, did, profile, loading, logout, openLogin };
}
