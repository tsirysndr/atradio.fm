import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { consola } from "consola";
import { clientAtom, didAtom } from "@/atoms/auth";
import {
  currentStationAtom,
  isPlayingAtom,
  mutedAtom,
  nowPlayingAtom,
  playbackStatusAtom,
  volumeAtom,
} from "@/atoms/player";
import {
  connectStatusAtom,
  devicesAtom,
  remoteTargetIdAtom,
  selfDeviceIdAtom,
} from "@/atoms/connect";
import {
  ConnectClient,
  setConnectClient,
  type ConnectHandlers,
} from "@/lib/connect/client";
import {
  buildPlaybackState,
  getDeviceId,
  getDeviceName,
  liteToStation,
} from "@/lib/connect/device";
import type { Command, PlaybackState } from "@/lib/connect/protocol";
import { deleteActorStatus } from "@/lib/atproto/records";

/**
 * Owns the Connect WebSocket for the logged-in user: reports this browser as a
 * controllable device, keeps the device roster in sync, applies remote-control
 * commands to the local player, and deletes the durable listening-status record
 * when the hub says no player is online. Renders nothing.
 */
export function ConnectProvider() {
  const client = useAtomValue(clientAtom);
  const did = useAtomValue(didAtom);

  const setDevices = useSetAtom(devicesAtom);
  const setStatus = useSetAtom(connectStatusAtom);
  const setSelfId = useSetAtom(selfDeviceIdAtom);
  const setRemoteTarget = useSetAtom(remoteTargetIdAtom);

  const setCurrentStation = useSetAtom(currentStationAtom);
  const setIsPlaying = useSetAtom(isPlayingAtom);
  const setPlaybackStatus = useSetAtom(playbackStatusAtom);
  const setVolume = useSetAtom(volumeAtom);
  const setMuted = useSetAtom(mutedAtom);

  // Latest local playback, so the client's getState() is always current.
  const station = useAtomValue(currentStationAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const volume = useAtomValue(volumeAtom);
  const muted = useAtomValue(mutedAtom);

  const stateRef = useRef<PlaybackState>(
    buildPlaybackState({ station, playing: isPlaying, title: nowPlaying, volume, muted }),
  );
  const connRef = useRef<ConnectClient | null>(null);

  // Apply a command received from a peer to the local player.
  const applyCommand = (cmd: Command) => {
    switch (cmd.action) {
      case "play":
        setRemoteTarget(null);
        setIsPlaying(true);
        break;
      case "pause":
        setIsPlaying(false);
        break;
      case "playPause":
        setIsPlaying((v) => !v);
        break;
      case "stop":
        setIsPlaying(false);
        setCurrentStation(null);
        setPlaybackStatus("idle");
        break;
      case "setVolume":
        setVolume(Math.min(1, Math.max(0, cmd.value)));
        break;
      case "toggleMute":
        setMuted((v) => !v);
        break;
      case "playStation":
        setRemoteTarget(null); // this device becomes the active player
        setCurrentStation(liteToStation(cmd.station));
        setIsPlaying(true);
        setPlaybackStatus("loading");
        break;
    }
  };

  // (Re)build the client whenever the identity/session changes.
  useEffect(() => {
    if (!client || !did) {
      connRef.current?.stop();
      connRef.current = null;
      setConnectClient(null);
      setStatus("offline");
      setDevices([]);
      setSelfId(null);
      return;
    }

    const handlers: ConnectHandlers = {
      onStatus: (s) => setStatus(s),
      onWelcome: (_d, deviceId) => setSelfId(deviceId),
      onDevices: (devices) => setDevices(devices),
      onCommand: (_from, cmd) => applyCommand(cmd),
      onPresence: (_anyPlaying, cleanup) => {
        if (cleanup) void deleteActorStatus(client, did);
      },
    };

    const conn = new ConnectClient({
      device: { id: getDeviceId(), name: getDeviceName(), platform: "web" },
      mintToken: async (aud, lxm) => {
        const res = await client.get("com.atproto.server.getServiceAuth", {
          params: {
            aud: aud as `did:${string}:${string}`,
            lxm: lxm as `${string}.${string}.${string}`,
            exp: Math.floor(Date.now() / 1000) + 60,
          },
        });
        if (!res.ok) throw new Error("getServiceAuth failed");
        return res.data.token;
      },
      getState: () => stateRef.current,
      handlers,
    });
    connRef.current = conn;
    setConnectClient(conn);
    void conn.start().catch((err) => consola.warn("[connect] start failed", err));

    return () => {
      conn.stop();
      connRef.current = null;
      setConnectClient(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, did]);

  // Broadcast this device's playback whenever it changes.
  useEffect(() => {
    const next = buildPlaybackState({
      station,
      playing: isPlaying,
      title: nowPlaying,
      volume,
      muted,
    });
    stateRef.current = next;
    connRef.current?.sendState(next);
  }, [station, isPlaying, nowPlaying, volume, muted]);

  return null;
}
