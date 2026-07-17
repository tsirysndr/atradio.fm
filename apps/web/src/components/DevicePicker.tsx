import { useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  IconBroadcast,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconTerminal2,
  IconCheck,
} from "@tabler/icons-react";
import { isLoggedInAtom } from "@/atoms/auth";
import {
  connectStatusAtom,
  devicesAtom,
  remoteTargetIdAtom,
  selectDeviceAtom,
} from "@/atoms/connect";
import type { DeviceInfo, Platform } from "@/lib/connect/protocol";

function platformIcon(platform: Platform) {
  if (platform === "cli") return IconTerminal2;
  if (platform === "web") return IconDeviceDesktop;
  return IconDeviceMobile;
}

function DeviceRow({
  device,
  active,
  onSelect,
}: {
  device: DeviceInfo;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("connect");
  const Icon = platformIcon(device.platform);
  const sub = device.state.station
    ? t("stateWith", {
        state: device.state.playing ? t("statePlaying") : t("statePaused"),
        station: device.state.station.name,
      })
    : t("stateIdle");
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5 ${
        active ? "bg-synth-cyan/10" : ""
      }`}
    >
      <Icon
        size={18}
        className={active ? "text-synth-cyan" : "text-foreground/60"}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground/90">
          {device.name}
          {device.self ? ` ${t("thisDevice")}` : ""}
        </span>
        <span className="block truncate text-xs text-foreground/50">{sub}</span>
      </span>
      {active ? (
        <IconCheck size={16} className="shrink-0 text-synth-cyan" />
      ) : null}
    </button>
  );
}

/**
 * "atradio Connect" device picker (navbar). Lists the account's connected
 * devices and lets the user pick which one to play/control — like Spotify's
 * devices menu. Hidden when logged out.
 */
export function DevicePicker() {
  const { t } = useTranslation("connect");
  const loggedIn = useAtomValue(isLoggedInAtom);
  const status = useAtomValue(connectStatusAtom);
  const devices = useAtomValue(devicesAtom);
  const remoteTargetId = useAtomValue(remoteTargetIdAtom);
  const selectDevice = useSetAtom(selectDeviceAtom);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!loggedIn) return null;

  const self = devices.find((d) => d.self) ?? null;
  const others = devices.filter((d) => !d.self);
  const remoteActive = !!remoteTargetId && others.some((d) => d.id === remoteTargetId);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t("buttonAria")}
        title={t("buttonTitle")}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:text-foreground ${
          remoteActive ? "text-synth-cyan" : "text-foreground/60"
        }`}
      >
        <IconBroadcast size={18} />
        {status === "online" && others.length > 0 ? (
          <span
            className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${
              remoteActive ? "bg-synth-cyan" : "bg-synth-magenta"
            }`}
          />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-synth-panel/95 p-2 shadow-xl backdrop-blur-xl">
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
            {t("title")}
          </div>
          {self ? (
            <DeviceRow
              device={self}
              active={!remoteActive}
              onSelect={() => {
                selectDevice(null);
                setOpen(false);
              }}
            />
          ) : null}
          {others.length === 0 ? (
            <div className="px-3 py-3 text-xs text-foreground/40">
              {t("noDevices")}
            </div>
          ) : (
            others.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                active={remoteTargetId === d.id}
                onSelect={() => {
                  selectDevice(d.id);
                  setOpen(false);
                }}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
