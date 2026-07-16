import { useState } from "react";
import { IconRadio } from "@tabler/icons-react";
import type { Station } from "@/lib/types";
import { proxiedImageUrl } from "@/lib/images";

interface StationLogoProps {
  station: Station;
  size?: number;
  className?: string;
}

/** Station favicon with a graceful neon fallback when the image is missing/broken. */
export function StationLogo({
  station,
  size = 48,
  className = "",
}: StationLogoProps) {
  const [errored, setErrored] = useState(false);
  const showImage = station.favicon && !errored;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-synth-panel ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={proxiedImageUrl(station.favicon)}
          alt=""
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <IconRadio
          size={Math.round(size * 0.5)}
          className="text-synth-magenta"
          stroke={1.5}
        />
      )}
    </div>
  );
}
