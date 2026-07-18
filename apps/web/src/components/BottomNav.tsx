import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  IconHome,
  IconBroadcast,
  IconBell,
  IconUserCircle,
  IconLogin2,
} from "@tabler/icons-react";
import { didAtom } from "@/atoms/auth";
import {
  connectStatusAtom,
  devicesAtom,
  remoteTargetIdAtom,
} from "@/atoms/connect";
import { getNotifications } from "@/lib/appview";
import { useAuth } from "@/hooks/useAuth";

const tabBase =
  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.62rem] font-medium transition-colors";

/** Icon + optional numeric badge / status dot. */
function TabIcon({
  icon,
  badge,
  dot,
  dotClass = "bg-synth-magenta",
}: {
  icon: ReactNode;
  badge?: number;
  dot?: boolean;
  dotClass?: string;
}) {
  return (
    <span className="relative flex h-6 items-center justify-center">
      {icon}
      {badge && badge > 0 ? (
        <span className="absolute -right-2 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-synth-pink px-1 text-[0.55rem] font-bold leading-none text-white shadow-[0_0_8px_rgba(255,45,149,0.7)]">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : dot ? (
        <span
          className={`absolute right-0 top-0 h-2 w-2 rounded-full ${dotClass}`}
        />
      ) : null}
    </span>
  );
}

/**
 * Mobile-only bottom tab bar. Surfaces Connect, Notifications and Profile as
 * their own full-screen routes (the desktop navbar keeps them as dropdowns).
 */
export function BottomNav() {
  const { t } = useTranslation("navbar");
  const { isLoggedIn, profile, openLogin } = useAuth();
  const did = useAtomValue(didAtom);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const status = useAtomValue(connectStatusAtom);
  const devices = useAtomValue(devicesAtom);
  const remoteTargetId = useAtomValue(remoteTargetIdAtom);
  const others = devices.filter((d) => !d.self);
  const remoteActive =
    !!remoteTargetId && others.some((d) => d.id === remoteTargetId);
  const connectDot = status === "online" && others.length > 0;

  const { data: notif } = useQuery({
    queryKey: ["notifications", did],
    queryFn: () => getNotifications(did!, { limit: 30 }),
    enabled: !!did,
    refetchInterval: 30_000,
  });
  const unread = notif?.unreadCount ?? 0;

  const activeCls = "text-synth-cyan";
  const idleCls = "text-foreground/55";
  const onHome = pathname === "/";
  const onConnect = pathname.startsWith("/connect");
  const onNotifs = pathname.startsWith("/notifications");
  const onProfile = pathname.startsWith("/profile");

  return (
    <nav
      aria-label={t("tabs.aria")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-synth-bg/95 backdrop-blur-xl sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-16 items-stretch justify-around">
        <Link to="/" className={`${tabBase} ${onHome ? activeCls : idleCls}`}>
          <TabIcon icon={<IconHome size={22} />} />
          <span>{t("tabs.home")}</span>
        </Link>

        {isLoggedIn && (
          <Link
            to="/connect"
            className={`${tabBase} ${
              onConnect || remoteActive ? activeCls : idleCls
            }`}
          >
            <TabIcon
              icon={<IconBroadcast size={22} />}
              dot={connectDot}
              dotClass={remoteActive ? "bg-synth-cyan" : "bg-synth-magenta"}
            />
            <span>{t("tabs.connect")}</span>
          </Link>
        )}

        {isLoggedIn && (
          <Link
            to="/notifications"
            className={`${tabBase} ${onNotifs ? activeCls : idleCls}`}
          >
            <TabIcon icon={<IconBell size={22} />} badge={unread} />
            <span>{t("tabs.notifications")}</span>
          </Link>
        )}

        {isLoggedIn ? (
          <Link
            to="/profile"
            className={`${tabBase} ${onProfile ? activeCls : idleCls}`}
          >
            <TabIcon
              icon={
                profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt=""
                    className={`h-6 w-6 rounded-full object-cover ${
                      onProfile ? "ring-2 ring-synth-cyan" : ""
                    }`}
                  />
                ) : (
                  <IconUserCircle size={22} />
                )
              }
            />
            <span>{t("tabs.profile")}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => openLogin(true)}
            className={`${tabBase} ${idleCls}`}
          >
            <TabIcon icon={<IconLogin2 size={22} />} />
            <span>{t("signIn", { ns: "common" })}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
