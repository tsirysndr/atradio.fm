import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Button, Slider } from "@heroui/react";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerStopFilled,
  IconVolume,
  IconVolumeOff,
  IconHeart,
  IconHeartFilled,
  IconAlertTriangle,
  IconMusic,
  IconAdjustmentsHorizontal,
  IconHeadphones,
  IconChevronUp,
  IconChevronDown,
  IconExternalLink,
  IconMessageCircle,
} from "@tabler/icons-react";
import type Hls from "hls.js";
import type { TrackMetadata } from "rockbox-wasm";
import {
  currentStationAtom,
  isPlayingAtom,
  mutedAtom,
  nowPlayingAtom,
  playbackStatusAtom,
  streamInfoAtom,
  volumeAtom,
  type StreamInfo,
} from "@/atoms/player";
import { isRemoteActiveAtom } from "@/atoms/connect";
import { favoriteIdsAtom, toggleFavoriteAtom } from "@/atoms/favorites";
import {
  audioSettingsOpenAtom,
  commentsStationAtom,
  playerFullscreenAtom,
} from "@/atoms/ui";
import {
  applyAudioSettings,
  useAudioSettingsSnapshot,
} from "@/atoms/audioSettings";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useListenerCount } from "@/hooks/useListenerCount";
import { ensureRockboxReady, getRockboxPlayer } from "@/lib/audio/rockbox";
import { resolveStream, proxiedStreamUrl } from "@/lib/audio/resolve";
import { watchIcyMetadata } from "@/lib/audio/icyMetadata";
import { SILENT_AUDIO_DATA_URI } from "@/lib/audio/silence";
import { proxiedImageUrl } from "@/lib/images";
import { registerRadioBrowserClick } from "@/lib/api/radioBrowser";
import { StationLogo } from "./StationLogo";
import { AudioBars } from "./AudioBars";
import { StationReactions } from "./StationReactions";
import { CommentsPanel } from "./CommentsPanel";

/** "MP3 · 44.1 kHz · 128 kbps" — from whatever fields are known. */
function formatStreamInfo(info: StreamInfo | null): string {
  if (!info) return "";
  const kHz = info.sampleRate
    ? `${(info.sampleRate / 1000).toFixed(1).replace(/\.0$/, "")} kHz`
    : null;
  return [
    info.codec?.toUpperCase(),
    kHz,
    info.bitrate ? `${info.bitrate} kbps` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Which backend currently owns playback. Direct streams go through the
 *  Rockbox wasm engine (decoders + DSP); HLS stays on <audio> (+ hls.js),
 *  which is also the fallback when the engine can't fetch a stream (CORS). */
type Engine = "rockbox" | "native";

export function Player() {
  const { t } = useTranslation("player");
  const station = useAtomValue(currentStationAtom);
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom);
  const [status, setStatus] = useAtom(playbackStatusAtom);
  const [volume, setVolume] = useAtom(volumeAtom);
  const [muted, setMuted] = useAtom(mutedAtom);
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const [streamInfo, setStreamInfo] = useAtom(streamInfoAtom);
  // When controlling a remote device, this browser is a controller, not a
  // player: local audio is silenced and the Connect banner replaces the bar.
  const remoteActive = useAtomValue(isRemoteActiveAtom);
  const favoriteIds = useAtomValue(favoriteIdsAtom);
  const toggleFavorite = useSetAtom(toggleFavoriteAtom);
  const openAudioSettings = useSetAtom(audioSettingsOpenAtom);
  const openComments = useSetAtom(commentsStationAtom);
  const ensureAuth = useRequireAuth();
  const audioSettings = useAudioSettingsSnapshot();
  const listeners = useListenerCount(station?.id);

  /** Fullscreen ("now playing") view toggle — shared so the `P` shortcut can
   *  open it too. */
  const [expanded, setExpanded] = useAtom(playerFullscreenAtom);

  const audioRef = useRef<HTMLAudioElement>(null);
  /** Silent loop anchoring the Media Session on the Web Audio (engine) path. */
  const silentRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  /** URL we already fell back to native for (avoid fallback loops). */
  const fallbackUrlRef = useRef<string | null>(null);
  /** Last track title the engine reported, so its once-per-second progress
   *  events only publish a real change instead of re-writing a stale title
   *  (which would otherwise fight and win over the live ICY poll below). */
  const lastEngineTitleRef = useRef<string | null>(null);

  // Latest values for use inside async flows / engine event handlers.
  const stateRef = useRef({ volume, muted, audioSettings });
  stateRef.current = { volume, muted, audioSettings };

  // Nothing playing → no fullscreen view.
  useEffect(() => {
    if (!station) setExpanded(false);
  }, [station]);

  // Lock the page body scroll while fullscreen is open, so only the player's
  // own scrollbar shows (a single one, on the screen's right edge).
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  // Esc closes the fullscreen view.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  /** Point the <audio> element at `url` when the wasm engine can't play it. */
  const fallbackToNative = (url: string) => {
    engineRef.current = "native";
    const audio = audioRef.current;
    if (!audio) return;
    setStatus("loading");
    audio.src = url;
    audio.load();
    void audio.play().catch(() => {});
  };

  // Mirror engine events into the player atoms (registered once).
  useEffect(() => {
    const p = getRockboxPlayer();

    const onStatus = ({ state }: { state: string }) => {
      if (engineRef.current !== "rockbox") return;
      if (state === "playing") setStatus("playing");
    };
    let lastInfoJson = "";
    const onMeta = (md: TrackMetadata | null) => {
      if (engineRef.current !== "rockbox" || !md) return;
      const text = [md.artist, md.title].filter(Boolean).join(" – ");
      // Only publish when the engine's OWN title actually changes. Progress
      // events fire every second carrying the same (often stale, connect-time)
      // StreamTitle for live radio; re-writing it each tick would clobber the
      // fresher server-side ICY poll and freeze "now playing" on song one.
      if (text && text !== lastEngineTitleRef.current) {
        lastEngineTitleRef.current = text;
        setNowPlaying(text);
      }
      const info: StreamInfo = {
        codec: md.codec,
        bitrate: md.bitrate || undefined,
        sampleRate: md.sample_rate || undefined,
      };
      // Progress events fire every second — only publish real changes.
      const json = JSON.stringify(info);
      if (json !== lastInfoJson && (info.codec || info.sampleRate)) {
        lastInfoJson = json;
        setStreamInfo(info);
      }
    };
    const onTrack = ({ metadata }: { metadata: TrackMetadata | null }) =>
      onMeta(metadata);
    const onProgress = ({ metadata }: { metadata: TrackMetadata | null }) =>
      onMeta(metadata);
    const onError = () => {
      if (engineRef.current !== "rockbox") return;
      const url = currentUrlRef.current;
      // Typical cause: the stream host doesn't send CORS headers, so the
      // decoder worker's fetch is blocked — the <audio> element still works.
      if (url && fallbackUrlRef.current !== url) {
        fallbackUrlRef.current = url;
        fallbackToNative(url);
      } else {
        setStatus("error");
        setIsPlaying(false);
      }
    };

    p.on("status", onStatus);
    p.on("track", onTrack);
    p.on("progress", onProgress);
    p.on("error", onError);
    return () => {
      p.off("status", onStatus);
      p.off("track", onTrack);
      p.off("progress", onProgress);
      p.off("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load & (re)resolve the stream whenever the selected station changes.
  useEffect(() => {
    if (!station) return;

    const controller = new AbortController();
    let cancelled = false;
    setStatus("loading");
    setNowPlaying(null);
    setStreamInfo(null);
    lastEngineTitleRef.current = null;

    // Tear down whatever the previous station was using.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    {
      const p = getRockboxPlayer();
      if (p.ready) p.stop();
    }

    // Boot the engine in parallel with stream resolution, while the click's
    // user activation is still fresh (the AudioContext needs a gesture).
    const engineBoot = ensureRockboxReady().catch(() => null);

    (async () => {
      try {
        const { url, isHls } = await resolveStream(station, controller.signal);
        if (cancelled) return;
        // Playback URL: http streams are routed through our https proxy so the
        // browser doesn't block them as mixed content. ICY polling below keeps
        // using the original URL (that runs server-side, no mixed content).
        const playUrl = isHls ? url : proxiedStreamUrl(url);
        currentUrlRef.current = playUrl;

        if (station.source === "radio-browser") {
          registerRadioBrowserClick(station.id);
        }

        if (isHls) {
          // HLS is segment-based — not the engine's territory.
          engineRef.current = "native";
          if (!audio) return;
          if (!audio.canPlayType("application/vnd.apple.mpegurl")) {
            const { default: HlsCtor } = await import("hls.js");
            if (cancelled) return;
            if (HlsCtor.isSupported()) {
              const hls = new HlsCtor();
              hlsRef.current = hls;
              hls.loadSource(playUrl);
              hls.attachMedia(audio);
              hls.on(HlsCtor.Events.ERROR, (_e, data) => {
                if (data.fatal) setStatus("error");
              });
            } else {
              audio.src = playUrl;
            }
          } else {
            audio.src = playUrl;
            audio.load();
          }
          await audio.play().catch(() => {
            /* element error listener handles surfacing */
          });
          return;
        }

        // Direct (Icecast/SHOUTcast/file) stream → Rockbox engine.
        // Server-side ICY "now playing" poll — authoritative for live track
        // titles (the engine often only reads the connect-time title). Apply
        // any non-empty title it returns; a transient empty result keeps the
        // current one rather than blanking it.
        void watchIcyMetadata(
          url,
          (title) => {
            if (title) setNowPlaying(title);
          },
          controller.signal,
        );

        const p = await engineBoot;
        if (cancelled) return;
        if (p) {
          engineRef.current = "rockbox";
          const { volume, muted, audioSettings } = stateRef.current;
          applyAudioSettings(p, audioSettings);
          p.setVolume(muted ? 0 : volume);
          p.setQueue([playUrl], true);
        } else {
          fallbackUrlRef.current = playUrl;
          fallbackToNative(playUrl);
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.id]);

  // Reflect user play/pause intent onto the active backend.
  useEffect(() => {
    if (!station) return;
    if (engineRef.current === "rockbox") {
      const p = getRockboxPlayer();
      if (!p.ready) return;
      if (isPlaying) p.play();
      else p.pause();
    } else {
      const audio = audioRef.current;
      if (!audio) return;
      if (isPlaying) audio.play().catch(() => {});
      else audio.pause();
    }
  }, [isPlaying, station]);

  // Volume / mute (both backends — only the active one is audible).
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = muted;
    }
    const p = getRockboxPlayer();
    if (p.ready) p.setVolume(muted ? 0 : volume);
  }, [volume, muted, station?.id]);

  // Handing off to a remote device: silence local playback. The play/pause
  // effect above then pauses whichever backend is active.
  useEffect(() => {
    if (remoteActive && isPlaying) setIsPlaying(false);
  }, [remoteActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFavorite = station ? favoriteIds.has(station.id) : false;

  const statusText: Record<string, string> = {
    idle: "",
    loading: t("status.buffering"),
    playing: t("status.onAir"),
    error: t("status.unavailable"),
  };

  // Engine-reported stream info, falling back to the station directory's
  // codec/bitrate (radio-browser) while buffering or on the native path.
  const infoText = formatStreamInfo(
    streamInfo ??
      (station && (station.codec || station.bitrate)
        ? { codec: station.codec, bitrate: station.bitrate }
        : null),
  );

  const handleStop = () => {
    const p = getRockboxPlayer();
    if (p.ready) p.stop();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setIsPlaying(false);
    setStatus("idle");
    setNowPlaying(null);
    setStreamInfo(null);
  };

  // ── Media Session — OS/lock-screen metadata + transport controls ────────
  // Keep the latest stop closure in a ref so the action handlers register once.
  const handleStopRef = useRef(handleStop);
  handleStopRef.current = handleStop;

  // Register transport action handlers a single time.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    const ms = navigator.mediaSession;
    const set = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action unsupported in this browser */
      }
    };
    set("play", () => setIsPlaying(true));
    set("pause", () => setIsPlaying(false));
    set("stop", () => handleStopRef.current());
    // Live radio: no seeking or track navigation.
    for (const a of [
      "previoustrack",
      "nexttrack",
      "seekbackward",
      "seekforward",
      "seekto",
    ] as MediaSessionAction[]) {
      set(a, null);
    }
    return () => {
      for (const a of ["play", "pause", "stop"] as MediaSessionAction[]) {
        set(a, null);
      }
    };
  }, [setIsPlaying]);

  // Publish "now playing" metadata — station + track + artwork, mirroring the
  // miniplayer. Updates whenever the station or track title changes.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    const ms = navigator.mediaSession;
    if (!station) {
      ms.metadata = null;
      return;
    }
    // Proxy http favicons so they aren't blocked as mixed content on https.
    const art = proxiedImageUrl(station.favicon);
    const artwork = art
      ? [96, 128, 192, 256, 384, 512].map((s) => ({
          src: art,
          sizes: `${s}x${s}`,
        }))
      : [];
    ms.metadata = new MediaMetadata({
      title: nowPlaying || station.name,
      artist: nowPlaying ? station.name : station.genre || t("liveRadio"),
      album: station.name,
      artwork,
    });
  }, [station, nowPlaying, t]);

  // Mirror play/pause state so OS controls show the right button.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    navigator.mediaSession.playbackState = !station
      ? "none"
      : isPlaying
        ? "playing"
        : "paused";
  }, [station, isPlaying]);

  // Keep the silent Media Session anchor playing while the engine (Web Audio)
  // owns playback — the native <audio> path already exposes a media element, so
  // the anchor is only needed when it doesn't.
  useEffect(() => {
    const el = silentRef.current;
    if (!el) return;
    const nativeHasElement = !!audioRef.current?.currentSrc;
    if (station && isPlaying && !nativeHasElement) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [station, isPlaying, status]);

  const fullscreen = station ? (
    <div
      className={`fixed inset-0 z-[60] overflow-y-auto overscroll-contain transition-opacity duration-300 ${
        expanded ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!expanded}
    >
      {/* Tap-anywhere backdrop — fixed so it stays put while the panel scrolls,
          keeping the single scrollbar on the screen's right edge. */}
      <button
        type="button"
        aria-label={t("aria.closeFullscreen")}
        onClick={() => setExpanded(false)}
        className="fixed inset-0 h-full w-full cursor-default bg-synth-bg/90 backdrop-blur-2xl"
      />

      <div
        className={`relative mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-4 transition-transform duration-300 sm:px-6 ${
          expanded ? "translate-y-0" : "translate-y-4"
        }`}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Button
            isIconOnly
            size="sm"
            variant="tertiary"
            className="rounded-full"
            aria-label={t("aria.minimize")}
            onPress={() => setExpanded(false)}
          >
            <IconChevronDown size={20} className="text-foreground/70" />
          </Button>
          <span className="text-[0.7rem] font-medium uppercase tracking-wider text-foreground/40">
            {t("nowPlaying")}
          </span>
          {station.homepage ? (
            <a
              href={station.homepage}
              target="_blank"
              rel="noreferrer"
              aria-label={t("aria.openStationPage")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-foreground/60 transition-colors hover:text-synth-cyan"
            >
              <IconExternalLink size={16} />
            </a>
          ) : (
            <span className="h-8 w-8" />
          )}
        </div>

        {/* Artwork + meta */}
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center sm:gap-6">
          <StationLogo
            station={station}
            size={224}
            className="shadow-2xl shadow-black/50"
          />

          <div className="flex w-full flex-col items-center gap-2">
            <h2 className="line-clamp-2 font-display text-xl font-bold tracking-tight sm:text-2xl">
              {station.name}
            </h2>

            <div className="flex min-h-5 items-center gap-2 text-sm">
              {status === "playing" && <AudioBars className="shrink-0" />}
              {status === "error" ? (
                <span className="flex items-center gap-1 text-danger">
                  <IconAlertTriangle size={15} />
                  {statusText.error}
                </span>
              ) : nowPlaying ? (
                <span className="flex min-w-0 items-center gap-1.5 text-synth-magenta">
                  <IconMusic size={15} className="shrink-0" />
                  <span className="line-clamp-1">{nowPlaying}</span>
                </span>
              ) : (
                <span className="text-synth-cyan/80">
                  {statusText[status] || station.genre || ""}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-foreground/50">
              {infoText && status !== "error" && (
                <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide">
                  {infoText}
                </span>
              )}
              {listeners ? (
                <span className="flex items-center gap-1 text-synth-purple">
                  <IconHeadphones size={13} />
                  {t("listeners", { count: listeners })}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 flex flex-col items-center gap-5 pb-2 sm:mt-10">
          <div className="flex items-center gap-4">
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              className="rounded-full"
              aria-label={t("aria.toggleFavorite")}
              onPress={() => ensureAuth(() => toggleFavorite(station))}
            >
              {isFavorite ? (
                <IconHeartFilled size={20} className="text-synth-pink" />
              ) : (
                <IconHeart size={20} className="text-foreground/70" />
              )}
            </Button>

            <Button
              isIconOnly
              size="lg"
              variant="primary"
              className="h-16 w-16 rounded-full !bg-white/10 !text-foreground hover:!bg-white/15"
              aria-label={isPlaying ? t("aria.pause") : t("aria.play")}
              onPress={() => setIsPlaying((p) => !p)}
            >
              {isPlaying ? (
                <IconPlayerPauseFilled size={30} />
              ) : (
                <IconPlayerPlayFilled size={30} />
              )}
            </Button>

            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              className="rounded-full"
              aria-label={t("aria.audioSettings")}
              onPress={() => openAudioSettings(true)}
            >
              <IconAdjustmentsHorizontal
                size={20}
                className={
                  audioSettings.eqEnabled
                    ? "text-synth-cyan"
                    : "text-foreground/70"
                }
              />
            </Button>
          </div>

          {/* Volume */}
          <div className="flex w-full max-w-xs items-center gap-3">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="rounded-full"
              aria-label={muted ? t("aria.unmute") : t("aria.mute")}
              onPress={() => setMuted((m) => !m)}
            >
              {muted || volume === 0 ? (
                <IconVolumeOff size={18} className="text-foreground/60" />
              ) : (
                <IconVolume size={18} className="text-foreground/70" />
              )}
            </Button>
            <Slider
              aria-label={t("aria.volume")}
              minValue={0}
              maxValue={1}
              step={0.01}
              value={[muted ? 0 : volume]}
              onChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v;
                setVolume(next);
                if (muted && next > 0) setMuted(false);
              }}
              className="flex-1"
            >
              <Slider.Track className="h-1.5 rounded-full bg-white/10">
                <Slider.Fill className="rounded-full bg-gradient-to-r from-synth-pink to-synth-cyan" />
                <Slider.Thumb className="h-3.5 w-3.5 bg-synth-cyan shadow-neon-cyan" />
              </Slider.Track>
            </Slider>
          </div>
        </div>

        {expanded && (
          <>
            {/* Emoji reactions — animated, real time */}
            <div className="mt-7 flex justify-center">
              <StationReactions station={station} variant="full" />
            </div>

            {/* Live comments */}
            <div className="mt-7 border-t border-white/10 pt-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground/80">
                <IconMessageCircle size={16} className="text-synth-pink" />
                {t("liveComments")}
              </h3>
              <CommentsPanel station={station} />
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <audio
        ref={audioRef}
        onPlaying={() => setStatus("playing")}
        onWaiting={() => setStatus("loading")}
        onError={() => {
          if (engineRef.current !== "native") return;
          setStatus("error");
          setIsPlaying(false);
        }}
        onPause={() => {
          if (audioRef.current?.ended) setIsPlaying(false);
        }}
      />

      {/* Silent Media Session anchor for the Web Audio (engine) path. */}
      <audio ref={silentRef} src={SILENT_AUDIO_DATA_URI} loop preload="auto" />

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4 transition-transform duration-300 ${
          station && !remoteActive
            ? "translate-y-0"
            : "translate-y-[calc(100%+1.5rem)]"
        }`}
      >
        <div className="pointer-events-auto mx-auto max-w-7xl overflow-hidden rounded-2xl border border-white/10 bg-synth-surface/40 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          {status === "loading" && (
            <div className="h-0.5 w-full overflow-hidden bg-transparent">
              <div className="h-full w-1/3 animate-pulse-bars bg-gradient-to-r from-synth-pink to-synth-cyan" />
            </div>
          )}

          <div className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
            {/* Station meta — tap to open the fullscreen player */}
            <button
              type="button"
              disabled={!station}
              onClick={() => station && setExpanded(true)}
              aria-label={t("aria.openFullscreen")}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-opacity enabled:hover:opacity-80 enabled:cursor-pointer"
            >
              {station && <StationLogo station={station} size={44} />}
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold text-foreground">
                  {station?.name ?? t("nothingPlaying")}
                </p>
                <div className="flex items-center gap-2">
                  {status === "playing" && (
                    <AudioBars className="mx-1 shrink-0" />
                  )}
                  {status === "error" ? (
                    <span className="flex items-center gap-1 text-xs text-danger">
                      <IconAlertTriangle size={13} />
                      {statusText.error}
                    </span>
                  ) : nowPlaying ? (
                    <span className="flex min-w-0 items-center gap-1 text-xs text-synth-magenta">
                      <IconMusic size={13} className="shrink-0" />
                      <span className="truncate">{nowPlaying}</span>
                    </span>
                  ) : (
                    <span className="truncate text-xs text-synth-cyan/80">
                      {statusText[status] || station?.genre || ""}
                    </span>
                  )}
                  {infoText && status !== "error" && (
                    <span className="hidden shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-foreground/50 sm:inline">
                      {infoText}
                    </span>
                  )}
                  {listeners ? (
                    <span
                      className="flex shrink-0 items-center gap-1 text-xs text-synth-purple"
                      title={t("uniqueListeners", { count: listeners })}
                    >
                      <IconHeadphones size={13} />
                      {listeners}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>

            {/* Transport controls */}
            <div className="flex items-center gap-1.5">
              <Button
                isIconOnly
                size="lg"
                variant="primary"
                className="rounded-full !bg-white/10 !text-foreground hover:!bg-white/15"
                aria-label={isPlaying ? t("aria.pause") : t("aria.play")}
                isDisabled={!station}
                onPress={() => setIsPlaying((p) => !p)}
              >
                {isPlaying ? (
                  <IconPlayerPauseFilled size={22} />
                ) : (
                  <IconPlayerPlayFilled size={22} />
                )}
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                className="rounded-full"
                aria-label={t("aria.stop")}
                isDisabled={!station}
                onPress={handleStop}
              >
                <IconPlayerStopFilled size={16} />
              </Button>
            </div>

            {/* Reactions — smiley opens an animated emoji picker, real time */}
            {station && <StationReactions station={station} variant="mini" />}

            {/* Favorite + comments + equalizer + volume */}
            <div className="flex items-center gap-2">
              {station && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  className="rounded-full"
                  aria-label={t("aria.toggleFavorite")}
                  onPress={() => ensureAuth(() => toggleFavorite(station))}
                >
                  {isFavorite ? (
                    <IconHeartFilled size={16} className="text-synth-pink" />
                  ) : (
                    <IconHeart size={16} className="text-foreground/70" />
                  )}
                </Button>
              )}

              {station && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  className="rounded-full"
                  aria-label={t("aria.comments")}
                  onPress={() => openComments(station)}
                >
                  <IconMessageCircle size={16} className="text-foreground/70" />
                </Button>
              )}

              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                className="rounded-full"
                aria-label={t("aria.audioSettings")}
                onPress={() => openAudioSettings(true)}
              >
                <IconAdjustmentsHorizontal
                  size={16}
                  className={
                    audioSettings.eqEnabled
                      ? "text-synth-cyan"
                      : "text-foreground/70"
                  }
                />
              </Button>

              <div className="hidden items-center gap-2 sm:flex">
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  aria-label={muted ? t("aria.unmute") : t("aria.mute")}
                  onPress={() => setMuted((m) => !m)}
                >
                  {muted || volume === 0 ? (
                    <IconVolumeOff size={18} className="text-foreground/60" />
                  ) : (
                    <IconVolume size={18} className="text-foreground/70" />
                  )}
                </Button>
                <Slider
                  aria-label={t("aria.volume")}
                  minValue={0}
                  maxValue={1}
                  step={0.01}
                  value={[muted ? 0 : volume]}
                  onChange={(v) => {
                    const next = Array.isArray(v) ? v[0] : v;
                    setVolume(next);
                    if (muted && next > 0) setMuted(false);
                  }}
                  className="w-24"
                >
                  <Slider.Track className="h-1.5 rounded-full bg-white/10">
                    <Slider.Fill className="rounded-full bg-gradient-to-r from-synth-pink to-synth-cyan" />
                    <Slider.Thumb className="h-3.5 w-3.5 bg-synth-cyan shadow-neon-cyan" />
                  </Slider.Track>
                </Slider>
              </div>

              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                className="hidden rounded-full sm:inline-flex"
                aria-label={t("aria.openFullscreen")}
                isDisabled={!station}
                onPress={() => setExpanded(true)}
              >
                <IconChevronUp size={18} className="text-foreground/70" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {fullscreen}
    </>
  );
}
