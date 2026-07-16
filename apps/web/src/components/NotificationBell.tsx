import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import {
  IconBell,
  IconAt,
  IconMessage2,
  IconMoodSmile,
} from "@tabler/icons-react";
import { infoToStation, type NotificationView } from "@atradio/lexicons";
import { didAtom, isLoggedInAtom } from "@/atoms/auth";
import { commentsStationAtom, notificationsOpenAtom } from "@/atoms/ui";
import { getNotifications, updateSeen } from "@/lib/appview";
import { timeAgo } from "@/lib/time";

export function NotificationRow({
  n,
  onOpenStation,
}: {
  n: NotificationView;
  onOpenStation: (n: NotificationView) => void;
}) {
  const { t } = useTranslation("notifications");
  const name = n.author.displayName || n.author.handle || t("someone");
  const reasonKey = n.reason === "mention" ? "row.mention" : "row.comment";
  const Icon = n.reason === "mention" ? IconAt : IconMessage2;

  return (
    <button
      type="button"
      onClick={() => onOpenStation(n)}
      className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${
        n.isRead ? "" : "bg-synth-pink/[0.06]"
      }`}
    >
      <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-synth-panel">
        {n.author.avatar ? (
          <img src={n.author.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <IconMoodSmile size={16} className="text-foreground/50" />
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-synth-surface">
          <Icon size={11} className="text-synth-pink" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-sm text-foreground/85">
          <Trans
            t={t}
            i18nKey={reasonKey}
            values={{ name }}
            components={{
              actor: <span className="font-semibold text-foreground" />,
            }}
          />
          {n.station ? (
            <span className="text-foreground/50"> · {n.station.name}</span>
          ) : null}
        </span>
        {n.text ? (
          <span className="mt-0.5 line-clamp-2 text-xs text-foreground/50">
            {n.text}
          </span>
        ) : null}
        <span className="mt-0.5 block text-[0.65rem] text-foreground/35">
          {timeAgo(n.createdAt)}
        </span>
      </span>
    </button>
  );
}

export function NotificationBell() {
  const { t } = useTranslation("notifications");
  const isLoggedIn = useAtomValue(isLoggedInAtom);
  const did = useAtomValue(didAtom);
  const [open, setOpen] = useAtom(notificationsOpenAtom);
  const setCommentsStation = useSetAtom(commentsStationAtom);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", did],
    queryFn: () => getNotifications(did!, { limit: 30 }),
    enabled: !!did,
    // Keep the badge fresh without a live socket for notifications.
    refetchInterval: 30_000,
  });

  if (!isLoggedIn || !did) return null;

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const markSeen = () => {
    if (unread > 0) {
      qc.setQueryData(
        ["notifications", did],
        (old: typeof data) => (old ? { ...old, unreadCount: 0 } : old),
      );
      void updateSeen(did)
        .then(() => qc.invalidateQueries({ queryKey: ["notifications", did] }))
        .catch(() => {});
    }
  };

  const handleClick = () => {
    // Mobile: navigate to a dedicated full-screen notifications page so the
    // view mounts fresh and truly fills the screen. Desktop: anchored dropdown.
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches;
    if (!isDesktop) {
      markSeen();
      void navigate({ to: "/notifications" });
      return;
    }
    const next = !open;
    setOpen(next);
    if (next) markSeen();
  };

  const openStation = (n: NotificationView) => {
    setOpen(false);
    if (n.station) setCommentsStation(infoToStation(n.station));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        aria-label={t("title")}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:text-foreground"
      >
        <IconBell size={19} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-synth-pink/60" />
            <span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-synth-pink px-1 text-[0.6rem] font-bold leading-none text-white shadow-[0_0_8px_rgba(255,45,149,0.7)]">
              {unread > 99 ? "99+" : unread}
            </span>
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          {/* Desktop: an anchored dropdown (mobile uses the /notifications route). */}
          <div className="absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-[min(92vw,22rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-synth-surface shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <span className="flex items-center gap-1.5 font-display text-sm font-semibold">
                <IconBell size={16} className="text-synth-pink" />
                {t("title")}
              </span>
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="text-xs text-synth-cyan/80 hover:text-synth-cyan"
              >
                {t("profile")}
              </Link>
            </div>
            <div className="overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-foreground/40">
                  {t("empty")}
                </p>
              ) : (
                items.map((n) => (
                  <NotificationRow
                    key={`${n.reason}:${n.uri}:${n.createdAt}`}
                    n={n}
                    onOpenStation={openStation}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
