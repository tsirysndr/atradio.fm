import { useEffect, useRef } from "react";
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
import { favoriteIdsAtom, toggleFavoriteAtom } from "@/atoms/favorites";
import { audioSettingsOpenAtom, playerFullscreenAtom } from "@/atoms/ui";
import {
  applyAudioSettings,
  useAudioSettingsSnapshot,
} from "@/atoms/audioSettings";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useListenerCount } from "@/hooks/useListenerCount";
import { ensureRockboxReady, getRockboxPlayer } from "@/lib/audio/rockbox";
import { resolveStream, proxiedStreamUrl } from "@/lib/audio/resolve";
import { watchIcyMetadata } from "@/lib/audio/icyMetadata";
import { registerRadioBrowserClick } from "@/lib/api/radioBrowser";
import { StationLogo } from "./StationLogo";
import { AudioBars } from "./AudioBars";

const STATUS_TEXT: Record<string, string> = {
  idle: "",
  loading: "Buffering…",
  playing: "On air",
  error: "Stream unavailable",
};

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
  const station = useAtomValue(currentStationAtom);
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom);
  const [status, setStatus] = useAtom(playbackStatusAtom);
  const [volume, setVolume] = useAtom(volumeAtom);
  const [muted, setMuted] = useAtom(mutedAtom);
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const [streamInfo, setStreamInfo] = useAtom(streamInfoAtom);
  const favoriteIds = useAtomValue(favoriteIdsAtom);
  const toggleFavorite = useSetAtom(toggleFavoriteAtom);
  const openAudioSettings = useSetAtom(audioSettingsOpenAtom);
  const ensureAuth = useRequireAuth();
  const audioSettings = useAudioSettingsSnapshot();
  const listeners = useListenerCount(station?.id);

  /** Fullscreen ("now playing") view toggle — shared so the `P` shortcut can
   *  open it too. */
  const [expanded, setExpanded] = useAtom(playerFullscreenAtom);

  const audioRef = useRef<HTMLAudioElement>(null);
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

  const isFavorite = station ? favoriteIds.has(station.id) : false;

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

  const fullscreen = station ? (
    <div
      className={`fixed inset-0 z-[60] transition-opacity duration-300 ${
        expanded ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!expanded}
    >
      {/* Tap-anywhere backdrop */}
      <button
        type="button"
        aria-label="Close fullscreen player"
        onClick={() => setExpanded(false)}
        className="absolute inset-0 h-full w-full cursor-default bg-synth-bg/90 backdrop-blur-2xl"
      />

      <div
        className={`relative mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto px-5 pt-4 transition-transform duration-300 sm:px-6 ${
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
            aria-label="Minimize player"
            onPress={() => setExpanded(false)}
          >
            <IconChevronDown size={20} className="text-foreground/70" />
          </Button>
          <span className="text-[0.7rem] font-medium uppercase tracking-wider text-foreground/40">
            Now playing
          </span>
          {station.homepage ? (
            <a
              href={station.homepage}
              target="_blank"
              rel="noreferrer"
              aria-label="Open station page"
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
                  {STATUS_TEXT.error}
                </span>
              ) : nowPlaying ? (
                <span className="flex min-w-0 items-center gap-1.5 text-synth-magenta">
                  <IconMusic size={15} className="shrink-0" />
                  <span className="line-clamp-1">{nowPlaying}</span>
                </span>
              ) : (
                <span className="text-synth-cyan/80">
                  {STATUS_TEXT[status] || station.genre || ""}
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
                  {listeners} {listeners === 1 ? "listener" : "listeners"}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-5 pb-2">
          <div className="flex items-center gap-4">
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              className="rounded-full"
              aria-label="Toggle favorite"
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
              aria-label={isPlaying ? "Pause" : "Play"}
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
              aria-label="Equalizer & audio settings"
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
              aria-label={muted ? "Unmute" : "Mute"}
              onPress={() => setMuted((m) => !m)}
            >
              {muted || volume === 0 ? (
                <IconVolumeOff size={18} className="text-foreground/60" />
              ) : (
                <IconVolume size={18} className="text-foreground/70" />
              )}
            </Button>
            <Slider
              aria-label="Volume"
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

      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4 transition-transform duration-300 ${
          station ? "translate-y-0" : "translate-y-[calc(100%+1.5rem)]"
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
              aria-label="Open fullscreen player"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-opacity enabled:hover:opacity-80 enabled:cursor-pointer"
            >
              {station && <StationLogo station={station} size={44} />}
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold text-foreground">
                  {station?.name ?? "Nothing playing"}
                </p>
                <div className="flex items-center gap-2">
                  {status === "playing" && (
                    <AudioBars className="mx-1 shrink-0" />
                  )}
                  {status === "error" ? (
                    <span className="flex items-center gap-1 text-xs text-danger">
                      <IconAlertTriangle size={13} />
                      {STATUS_TEXT.error}
                    </span>
                  ) : nowPlaying ? (
                    <span className="flex min-w-0 items-center gap-1 text-xs text-synth-magenta">
                      <IconMusic size={13} className="shrink-0" />
                      <span className="truncate">{nowPlaying}</span>
                    </span>
                  ) : (
                    <span className="truncate text-xs text-synth-cyan/80">
                      {STATUS_TEXT[status] || station?.genre || ""}
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
                      title={`${listeners} unique ${listeners === 1 ? "listener" : "listeners"}`}
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
                aria-label={isPlaying ? "Pause" : "Play"}
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
                aria-label="Stop"
                isDisabled={!station}
                onPress={handleStop}
              >
                <IconPlayerStopFilled size={16} />
              </Button>
            </div>

            {/* Favorite + equalizer + volume */}
            <div className="flex items-center gap-2">
              {station && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  className="rounded-full"
                  aria-label="Toggle favorite"
                  onPress={() => ensureAuth(() => toggleFavorite(station))}
                >
                  {isFavorite ? (
                    <IconHeartFilled size={16} className="text-synth-pink" />
                  ) : (
                    <IconHeart size={16} className="text-foreground/70" />
                  )}
                </Button>
              )}

              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                className="rounded-full"
                aria-label="Equalizer & audio settings"
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
                  aria-label={muted ? "Unmute" : "Mute"}
                  onPress={() => setMuted((m) => !m)}
                >
                  {muted || volume === 0 ? (
                    <IconVolumeOff size={18} className="text-foreground/60" />
                  ) : (
                    <IconVolume size={18} className="text-foreground/70" />
                  )}
                </Button>
                <Slider
                  aria-label="Volume"
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
                aria-label="Open fullscreen player"
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
