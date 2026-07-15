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
import { audioSettingsOpenAtom } from "@/atoms/ui";
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

  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  /** URL we already fell back to native for (avoid fallback loops). */
  const fallbackUrlRef = useRef<string | null>(null);
  /** True once the engine delivered ICY metadata for this station — the
   *  proxy-based watcher then stops overwriting it. */
  const engineMetaRef = useRef(false);

  // Latest values for use inside async flows / engine event handlers.
  const stateRef = useRef({ volume, muted, audioSettings });
  stateRef.current = { volume, muted, audioSettings };

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
      if (text) {
        engineMetaRef.current = true;
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
    engineMetaRef.current = false;

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
        // Best-effort ICY "now playing" via the proxy, for streams whose
        // metadata the engine can't read over CORS.
        void watchIcyMetadata(
          url,
          (title) => {
            if (!engineMetaRef.current) setNowPlaying(title);
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
        className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ${
          station ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="border-t border-white/10 bg-synth-surface/90 backdrop-blur-xl">
          {status === "loading" && (
            <div className="h-0.5 w-full overflow-hidden bg-transparent">
              <div className="h-full w-1/3 animate-pulse-bars bg-gradient-to-r from-synth-pink to-synth-cyan" />
            </div>
          )}

          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
            {/* Station meta */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
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
                      className="flex shrink-0 items-center gap-1 text-xs text-synth-magenta"
                      title={`${listeners} unique ${listeners === 1 ? "listener" : "listeners"}`}
                    >
                      <IconHeadphones size={13} />
                      {listeners}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Transport controls */}
            <div className="flex items-center gap-1.5">
              <Button
                isIconOnly
                size="lg"
                variant="primary"
                className="rounded-full shadow-neon"
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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
