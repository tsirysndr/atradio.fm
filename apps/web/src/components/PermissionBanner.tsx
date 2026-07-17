import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { NSID } from "@atradio/lexicons";
import { sessionAtom } from "@/atoms/auth";
import { connectAuthErrorAtom } from "@/atoms/connect";
import { useAuth } from "@/hooks/useAuth";
import { CONNECT_RPC_SCOPE, missingScopes } from "@/lib/atproto/client";

/** i18n key (under `features.*`) for a scope the session is missing. */
const SCOPE_FEATURE: Record<string, string> = {
  [`repo:${NSID.comment}`]: "comments",
  [`repo:${NSID.reaction}`]: "reactions",
  [`repo:${NSID.favorite}`]: "favorites",
  [`repo:${NSID.station}`]: "stations",
  [`repo:${NSID.actorStatus}`]: "status",
  [`repo:${NSID.audioSettings}`]: "audio",
  [CONNECT_RPC_SCOPE]: "connect",
};

/**
 * When the logged-in user's session was granted before we added new lexicon
 * permissions (e.g. comments, reactions), it can't write those records. Show a
 * top banner prompting them to log out and back in to grant the new scopes.
 */
export function PermissionBanner() {
  const { t } = useTranslation("permission");
  const session = useAtomValue(sessionAtom);
  const authError = useAtomValue(connectAuthErrorAtom);
  const { logout, openLogin } = useAuth();
  const [busy, setBusy] = useState(false);

  const missing = useMemo(
    () => (session ? missingScopes(session.token.scope) : []),
    [session],
  );

  // Two reasons to nag a re-login, both fixed by signing in again:
  //   1. the session predates a scope the app now needs (`missing`);
  //   2. the session's token can no longer be refreshed (`authError`) — it
  //      silently can't mint the service-auth JWTs writes + Connect rely on.
  // Missing scopes take priority (more specific, actionable message).
  // Not dismissible — it stays until re-authentication clears the condition.
  if (!session || (missing.length === 0 && !authError)) return null;

  const features = Array.from(
    new Set(missing.map((s) => SCOPE_FEATURE[s]).filter(Boolean)),
  ).map((key) => t(`features.${key}`));
  const featureText =
    features.length === 0
      ? t("featuresFallback")
      : features.length === 1
        ? features[0]
        : `${features.slice(0, -1).join(", ")} ${t("and")} ${features[features.length - 1]}`;

  // Expired-session message when there are no missing scopes to name.
  const expiredOnly = missing.length === 0 && authError;

  const reauth = async () => {
    setBusy(true);
    try {
      await logout();
      openLogin(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-50 border-b border-synth-yellow/30 bg-synth-yellow/10 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <IconAlertTriangle
          size={18}
          className="shrink-0 text-synth-yellow"
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-sm text-foreground/90">
          <Trans
            t={t}
            i18nKey={expiredOnly ? "expired" : "message"}
            values={{ features: featureText }}
            components={{
              strong: (
                <span className="font-semibold text-synth-yellow" />
              ),
            }}
          />
        </p>

        <button
          type="button"
          onClick={() => void reauth()}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-synth-yellow/20 px-3 py-1.5 text-xs font-semibold text-synth-yellow transition-colors hover:bg-synth-yellow/30 disabled:opacity-50"
        >
          <IconRefresh size={14} className={busy ? "animate-spin" : ""} />
          {busy ? t("signingOut") : t("reauth")}
        </button>
      </div>
    </div>
  );
}
