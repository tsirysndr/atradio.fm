import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Button, Chip } from "@heroui/react";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconHeart,
  IconHeartFilled,
  IconExternalLink,
  IconTrash,
  IconHeadphones,
  IconMessageCircle,
} from "@tabler/icons-react";
import type { Station } from "@/lib/types";
import { useListenerCount } from "@/hooks/useListenerCount";
import {
  currentStationAtom,
  isPlayingAtom,
  playStationAtom,
  togglePlayAtom,
} from "@/atoms/player";
import { favoriteIdsAtom, toggleFavoriteAtom } from "@/atoms/favorites";
import { commentsStationAtom } from "@/atoms/ui";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { StationLogo } from "./StationLogo";
import { AudioBars } from "./AudioBars";

const SOURCE_LABEL: Record<Station["source"], string> = {
  "radio-browser": "radio-browser",
  tunein: "TuneIn",
  custom: "yours",
};

// TuneIn + radio-browser share an electric-cyan badge; custom stations stay green.
const CYAN_CHIP =
  "!bg-synth-cyan/10 !text-synth-cyan shadow-[0_0_5px_rgba(5,217,232,0.15)]";

interface StationCardProps {
  station: Station;
  /** Shown for user-created stations on the profile page. */
  onRemove?: (station: Station) => void;
}

export function StationCard({ station, onRemove }: StationCardProps) {
  const { t } = useTranslation("station");
  const current = useAtomValue(currentStationAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const play = useSetAtom(playStationAtom);
  const togglePlay = useSetAtom(togglePlayAtom);
  const favoriteIds = useAtomValue(favoriteIdsAtom);
  const toggleFavorite = useSetAtom(toggleFavoriteAtom);
  const openComments = useSetAtom(commentsStationAtom);
  const ensureAuth = useRequireAuth();

  const isCurrent = current?.id === station.id;
  const isActive = isCurrent && isPlaying;
  const isFavorite = favoriteIds.has(station.id);
  const listeners = useListenerCount(station.id);

  const handlePlay = () => {
    if (isCurrent) togglePlay();
    else play(station);
  };

  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-white/10 bg-synth-surface/70 p-4 backdrop-blur">
      <div className="flex items-start gap-3">
        <StationLogo station={station} size={52} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className="truncate font-display text-base font-semibold text-foreground"
              title={station.name}
            >
              {station.name}
            </h3>
            {isActive && <AudioBars className="shrink-0" />}
          </div>
          {station.genre && (
            <p className="truncate text-xs text-synth-cyan/90">
              {station.genre}
            </p>
          )}
          {station.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-foreground/60">
              {station.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {station.source === "custom" ? (
          <Chip size="sm" variant="soft" color="success">
            {t("sourceYours")}
          </Chip>
        ) : (
          <Chip size="sm" variant="soft" className={CYAN_CHIP}>
            {SOURCE_LABEL[station.source]}
          </Chip>
        )}
        {station.country && (
          <Chip size="sm" variant="soft" color="default">
            {station.country}
          </Chip>
        )}
        {station.bitrate ? (
          <Chip size="sm" variant="soft" color="default">
            {station.bitrate}kbps
          </Chip>
        ) : null}
        {listeners ? (
          <Chip
            size="sm"
            variant="soft"
            className="gap-1 !bg-synth-purple/10 !text-synth-purple"
            title={t("listeners", { count: listeners })}
          >
            <IconHeadphones size={12} />
            {listeners}
          </Chip>
        ) : null}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="primary"
          className="flex-1 gap-1.5 rounded-full !bg-white/10 !text-foreground hover:!bg-white/15"
          onPress={handlePlay}
        >
          {isActive ? (
            <IconPlayerPauseFilled size={16} />
          ) : (
            <IconPlayerPlayFilled size={16} />
          )}
          {isActive ? t("pause") : isCurrent ? t("resume") : t("play")}
        </Button>

        <Button
          isIconOnly
          size="sm"
          variant="tertiary"
          className={`rounded-full ${
            isFavorite
              ? "!bg-synth-pink/15 hover:!bg-synth-pink/25"
              : "!bg-white/5 hover:!bg-white/10"
          }`}
          aria-label={isFavorite ? t("removeFavorite") : t("addFavorite")}
          onPress={() => ensureAuth(() => toggleFavorite(station))}
        >
          {isFavorite ? (
            <IconHeartFilled size={16} className="text-synth-pink" />
          ) : (
            <IconHeart size={16} className="text-foreground/70" />
          )}
        </Button>

        <Button
          isIconOnly
          size="sm"
          variant="tertiary"
          className="rounded-full !bg-white/5 hover:!bg-white/10"
          aria-label={t("comments")}
          onPress={() => openComments(station)}
        >
          <IconMessageCircle size={16} className="text-foreground/70" />
        </Button>

        {station.homepage && (
          <a
            href={station.homepage}
            target="_blank"
            rel="noreferrer"
            aria-label={t("openStationPage")}
            title={t("openStationPage")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-foreground/70 transition-colors hover:bg-white/10 hover:text-synth-cyan"
          >
            <IconExternalLink size={16} />
          </a>
        )}

        {onRemove && (
          <Button
            isIconOnly
            size="sm"
            variant="tertiary"
            className="rounded-full"
            aria-label={t("deleteStation")}
            onPress={() => onRemove(station)}
          >
            <IconTrash size={16} className="text-danger" />
          </Button>
        )}
      </div>
    </div>
  );
}
