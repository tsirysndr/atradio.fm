import { useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Button } from "@heroui/react";
import {
  IconHeart,
  IconBroadcast,
  IconPlus,
  IconUserCircle,
} from "@tabler/icons-react";
import { favoritesAtom } from "@/atoms/favorites";
import {
  customStationsAtom,
  removeCustomStationAtom,
} from "@/atoms/customStations";
import { addStationOpenAtom } from "@/atoms/ui";
import { StationGrid } from "@/components/StationGrid";
import { EmptyState } from "@/components/EmptyState";
import type { Station } from "@/lib/types";

type TabKey = "favorites" | "custom";

export function ProfilePage() {
  const favorites = useAtomValue(favoritesAtom);
  const [customStations] = useAtom(customStationsAtom);
  const removeCustom = useSetAtom(removeCustomStationAtom);
  const openAddStation = useSetAtom(addStationOpenAtom);
  const [tab, setTab] = useState<TabKey>("favorites");

  const handleRemoveCustom = (station: Station) => removeCustom(station.id);

  const stats = useMemo(
    () => [
      { label: "Favorites", value: favorites.length },
      { label: "Your stations", value: customStations.length },
    ],
    [favorites.length, customStations.length],
  );

  const tabs: { key: TabKey; label: string; count: number; icon: typeof IconHeart }[] =
    [
      {
        key: "favorites",
        label: "Favorites",
        count: favorites.length,
        icon: IconHeart,
      },
      {
        key: "custom",
        label: "Your stations",
        count: customStations.length,
        icon: IconBroadcast,
      },
    ];

  return (
    <div className="flex flex-col gap-8">
      {/* Profile header */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-synth-purple to-synth-cyan shadow-neon">
            <IconUserCircle size={40} className="text-white" stroke={1.5} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold">
              <span className="synth-gradient-text">Your dial</span>
            </h1>
            <div className="mt-1 flex gap-4 text-sm text-foreground/60">
              {stats.map((s) => (
                <span key={s.label}>
                  <span className="font-semibold text-synth-cyan">
                    {s.value}
                  </span>{" "}
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div>
        <div
          role="tablist"
          aria-label="Profile sections"
          className="flex gap-6 border-b border-white/10"
        >
          {tabs.map(({ key, label, count, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors ${
                  active
                    ? "border-synth-pink text-foreground"
                    : "border-transparent text-foreground/50 hover:text-foreground/80"
                }`}
              >
                <Icon size={16} className={active ? "text-synth-pink" : ""} />
                {label} ({count})
              </button>
            );
          })}
        </div>

        <div className="pt-6">
          {tab === "favorites" &&
            (favorites.length === 0 ? (
              <EmptyState
                icon={<IconHeart size={40} stroke={1.5} />}
                title="No favorites yet"
                description="Tap the heart on any station to save it here for quick access."
              />
            ) : (
              <StationGrid stations={favorites} />
            ))}

          {tab === "custom" &&
            (customStations.length === 0 ? (
              <EmptyState
                icon={<IconBroadcast size={40} stroke={1.5} />}
                title="You haven't added any stations"
                description="Know a stream that isn't listed? Add it with its name and stream URL."
                action={
                  <Button
                    variant="primary"
                    className="gap-1.5 rounded-full"
                    onPress={() => openAddStation(true)}
                  >
                    <IconPlus size={16} />
                    Add your first station
                  </Button>
                }
              />
            ) : (
              <StationGrid
                stations={customStations}
                onRemove={handleRemoveCustom}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
