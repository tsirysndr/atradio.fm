import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { isLoggedInAtom } from "@/atoms/auth";
import { loginModalOpenAtom } from "@/atoms/ui";

/**
 * Returns `ensureAuth(fn)`: runs `fn` when logged in, otherwise opens the login
 * modal. Used to gate the saving actions (favorite / add / remove).
 */
export function useRequireAuth() {
  const isLoggedIn = useAtomValue(isLoggedInAtom);
  const openLogin = useSetAtom(loginModalOpenAtom);

  return useCallback(
    (fn: () => void) => {
      if (isLoggedIn) fn();
      else openLogin(true);
    },
    [isLoggedIn, openLogin],
  );
}
