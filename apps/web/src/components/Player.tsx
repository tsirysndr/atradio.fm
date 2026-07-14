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
} from "@tabler/icons-react";
import type Hls from "hls.js";
import {
  currentStationAtom,
  isPlayingAtom,
  mutedAtom,
  nowPlayingAtom,
  playbackStatusAtom,
  volumeAtom,
} from "@/atoms/player";
import { favoriteIdsAtom, toggleFavoriteAtom } from "@/atoms/favorites";
import { resolveStream } from "@/lib/audio/resolve";
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

export function Player() {
  const station = useAtomValue(currentStationAtom);
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom);
  const [status, setStatus] = useAtom(playbackStatusAtom);
  const [volume, setVolume] = useAtom(volumeAtom);
  const [muted, setMuted] = useAtom(mutedAtom);
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const favoriteIds = useAtomValue(favoriteIdsAtom);
  const toggleFavorite = useSetAtom(toggleFavoriteAtom);

  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Load & (re)resolve the stream whenever the selected station changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station) return;

    const controller = new AbortController();
    let cancelled = false;
    setStatus("loading");
    setNowPlaying(null);

    const teardownHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    teardownHls();

    (async () => {
      try {
        const { url, isHls } = await resolveStream(station, controller.signal);
        if (cancelled) return;

        const nativeHls = audio.canPlayType("application/vnd.apple.mpegurl");
        if (isHls && !nativeHls) {
          const { default: HlsCtor } = await import("hls.js");
          if (cancelled) return;
          if (HlsCtor.isSupported()) {
            const hls = new HlsCtor();
            hlsRef.current = hls;
            hls.loadSource(url);
            hls.attachMedia(audio);
            hls.on(HlsCtor.Events.ERROR, (_e, data) => {
              if (data.fatal) setStatus("error");
            });
          } else {
            audio.src = url;
          }
        } else {
          audio.src = url;
          audio.load();
        }

        if (station.source === "radio-browser") {
          registerRadioBrowserClick(station.id);
        }

        // Best-effort ICY "now playing" — only for direct (non-HLS) streams.
        if (!isHls) {
          void watchIcyMetadata(url, setNowPlaying, controller.signal);
        }

        await audio.play().catch(() => {
          /* element error listener handles surfacing */
        });
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

  // Reflect user play/pause intent onto the media element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying, station]);

  // Volume / mute.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted, station?.id]);

  const isFavorite = station ? favoriteIds.has(station.id) : false;

  const handleStop = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setIsPlaying(false);
    setStatus("idle");
    setNowPlaying(null);
  };

  return (
    <>
      <audio
        ref={audioRef}
        onPlaying={() => setStatus("playing")}
        onWaiting={() => setStatus("loading")}
        onError={() => {
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
                    <>
                      {status === "playing" && <AudioBars />}
                      <span className="truncate text-xs text-synth-cyan/80">
                        {STATUS_TEXT[status] || station?.genre || ""}
                      </span>
                    </>
                  )}
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

            {/* Favorite + volume */}
            <div className="flex items-center gap-2">
              {station && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  className="rounded-full"
                  aria-label="Toggle favorite"
                  onPress={() => toggleFavorite(station)}
                >
                  {isFavorite ? (
                    <IconHeartFilled size={16} className="text-synth-pink" />
                  ) : (
                    <IconHeart size={16} className="text-foreground/70" />
                  )}
                </Button>
              )}

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
