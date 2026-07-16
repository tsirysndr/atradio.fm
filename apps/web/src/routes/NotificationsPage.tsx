import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { IconBell } from "@tabler/icons-react";
import { infoToStation, type NotificationView } from "@atradio/lexicons";
import { didAtom } from "@/atoms/auth";
import { commentsStationAtom } from "@/atoms/ui";
import { getNotifications, updateSeen } from "@/lib/appview";
import { NotificationRow } from "@/components/NotificationBell";

export function NotificationsPage() {
  const did = useAtomValue(didAtom);
  const setCommentsStation = useSetAtom(commentsStationAtom);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", did],
    queryFn: () => getNotifications(did!, { limit: 30 }),
    enabled: !!did,
    refetchInterval: 30_000,
  });

  // Mark everything as seen when the screen mounts (badge → 0).
  useEffect(() => {
    if (!did) return;
    qc.setQueryData(
      ["notifications", did],
      (old: typeof data) => (old ? { ...old, unreadCount: 0 } : old),
    );
    void updateSeen(did)
      .then(() => qc.invalidateQueries({ queryKey: ["notifications", did] }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did]);

  const items = data?.items ?? [];

  const openStation = (n: NotificationView) => {
    if (n.station) {
      setCommentsStation(infoToStation(n.station));
      void navigate({ to: "/" });
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-14rem)] w-full min-w-0 flex-col">
      <h1 className="mb-2 flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
        <IconBell size={24} className="text-synth-pink" />
        Notifications
      </h1>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <p className="max-w-xs text-center text-sm text-foreground/40">
            Nothing yet. Mentions and comments on your stations show up here.
          </p>
        </div>
      ) : (
        <div className="-mx-2 flex flex-col divide-y divide-white/5">
          {items.map((n) => (
            <NotificationRow
              key={`${n.reason}:${n.uri}:${n.createdAt}`}
              n={n}
              onOpenStation={openStation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
