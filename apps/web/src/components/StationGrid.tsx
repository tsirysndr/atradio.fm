import type { Station } from "@/lib/types";
import { StationCard } from "./StationCard";

interface StationGridProps {
  stations: Station[];
  onRemove?: (station: Station) => void;
}

export function StationGrid({ stations, onRemove }: StationGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {stations.map((station) => (
        <StationCard
          key={station.id}
          station={station}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
