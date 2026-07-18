import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Slider } from "@heroui/react";
import {
  IconBroadcast,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerStopFilled,
  IconVolume,
  IconDeviceDesktop,
} from "@tabler/icons-react";
import {
  remoteTargetAtom,
  remoteTargetIdAtom,
  selectDeviceAtom,
} from "@/atoms/connect";
import { getConnectClient } from "@/lib/connect/client";
import { liteToStation } from "@/lib/connect/device";
import type { Command } from "@/lib/connect/protocol";
import { StationLogo } from "./StationLogo";

/**
 * Bottom banner shown while this browser is controlling a remote device
 * (Spotify-Connect "Playing on …" bar). Reflects the remote's now-playing and
 * routes transport there; "Play here" pulls playback back to this device.
 */
export function ConnectBanner() {
  const { t } = useTranslation("connect");
  const target = useAtomValue(remoteTargetAtom);
  const targetId = useAtomValue(remoteTargetIdAtom);
  const selectDevice = useSetAtom(selectDeviceAtom);

  if (!target || !targetId) return null;

  const send = (cmd: Command) => getConnectClient()?.command(targetId, cmd);
  const { state } = target;
  const station = state.station;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-50 border-t border-synth-cyan/30 bg-synth-panel/95 backdrop-blur-xl sm:bottom-0">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        {station ? (
          <StationLogo
            station={liteToStation(station)}
            size={40}
            className="h-10 w-10 shrink-0"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/5">
            <IconBroadcast size={18} className="text-synth-cyan" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground/90">
            {station?.name ?? t("nothingPlaying")}
          </div>
          <div className="flex items-center gap-1.5 truncate text-xs text-synth-cyan">
            <IconBroadcast size={12} className="shrink-0" />
            <span className="truncate">
              {state.title ? `${state.title} · ` : ""}
              {t("playingOn", { name: target.name })}
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-label={state.playing ? t("pause") : t("play")}
          onClick={() => send({ action: "playPause" })}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 transition-colors hover:text-synth-cyan"
        >
          {state.playing ? (
            <IconPlayerPauseFilled size={20} />
          ) : (
            <IconPlayerPlayFilled size={20} />
          )}
        </button>

        <button
          type="button"
          aria-label={t("stop")}
          onClick={() => send({ action: "stop" })}
          className="hidden h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:text-synth-cyan sm:flex"
        >
          <IconPlayerStopFilled size={18} />
        </button>

        <div className="hidden items-center gap-2 md:flex">
          <IconVolume size={16} className="text-foreground/50" />
          <Slider
            aria-label={t("remoteVolume")}
            minValue={0}
            maxValue={1}
            step={0.01}
            value={[state.volume]}
            onChange={(v) =>
              send({
                action: "setVolume",
                value: Array.isArray(v) ? v[0] : v,
              })
            }
            className="w-24"
          >
            <Slider.Track className="h-1.5 rounded-full bg-white/10">
              <Slider.Fill className="rounded-full bg-gradient-to-r from-synth-pink to-synth-cyan" />
              <Slider.Thumb className="h-3.5 w-3.5 bg-synth-cyan shadow-neon-cyan" />
            </Slider.Track>
          </Slider>
        </div>

        <button
          type="button"
          onClick={() => selectDevice(null)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-synth-cyan/15 px-3 py-1.5 text-xs font-semibold text-synth-cyan transition-colors hover:bg-synth-cyan/25"
        >
          <IconDeviceDesktop size={14} />
          {t("playHere")}
        </button>
      </div>
    </div>
  );
}
