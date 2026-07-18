import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { IconBroadcast } from "@tabler/icons-react";
import { isLoggedInAtom } from "@/atoms/auth";
import {
  connectStatusAtom,
  devicesAtom,
  remoteTargetIdAtom,
  selectDeviceAtom,
} from "@/atoms/connect";
import { DeviceRow } from "@/components/DevicePicker";

/**
 * Full-screen "atradio Connect" device picker — the mobile counterpart to the
 * navbar's {@link DevicePicker} dropdown, reached from the bottom tab bar.
 */
export function ConnectPage() {
  const { t } = useTranslation("connect");
  const loggedIn = useAtomValue(isLoggedInAtom);
  const status = useAtomValue(connectStatusAtom);
  const devices = useAtomValue(devicesAtom);
  const remoteTargetId = useAtomValue(remoteTargetIdAtom);
  const selectDevice = useSetAtom(selectDeviceAtom);

  const self = devices.find((d) => d.self) ?? null;
  const others = devices.filter((d) => !d.self);
  const remoteActive =
    !!remoteTargetId && others.some((d) => d.id === remoteTargetId);

  return (
    <div className="flex min-h-[calc(100vh-14rem)] w-full min-w-0 flex-col">
      <h1 className="mb-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
        <IconBroadcast size={24} className="text-synth-cyan" />
        {t("title")}
      </h1>
      <p className="mb-4 text-sm text-foreground/45">
        {status === "online" ? t("statusOnline") : t("statusOffline")}
      </p>

      {!loggedIn ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <p className="max-w-xs text-center text-sm text-foreground/40">
            {t("signedOut")}
          </p>
        </div>
      ) : (
        <div className="-mx-2 flex flex-col gap-1">
          {self ? (
            <DeviceRow
              device={self}
              active={!remoteActive}
              onSelect={() => selectDevice(null)}
            />
          ) : null}
          {others.length === 0 ? (
            <p className="px-3 py-6 text-sm text-foreground/40">
              {t("noDevices")}
            </p>
          ) : (
            others.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                active={remoteTargetId === d.id}
                onSelect={() => selectDevice(d.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
