import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Spinner } from "@heroui/react";
import {
  IconHeart,
  IconBroadcast,
  IconPlus,
  IconUserCircle,
  IconLogin2,
  IconLogout,
} from "@tabler/icons-react";
import { favoritesAtom } from "@/atoms/favorites";
import {
  customStationsAtom,
  removeCustomStationAtom,
} from "@/atoms/customStations";
import { addStationOpenAtom } from "@/atoms/ui";
import { useAuth } from "@/hooks/useAuth";
import { getProfile, type ActorProfile } from "@/lib/atproto/profile";
import { readPublicUser } from "@/lib/atproto/publicReader";
import { StationGrid } from "@/components/StationGrid";
import { EmptyState } from "@/components/EmptyState";
import type { Station } from "@/lib/types";

export function ProfilePage() {
  const params = useParams({ strict: false }) as { actor?: string };
  return params.actor ? (
    <PublicProfile actor={params.actor} />
  ) : (
    <SelfProfile />
  );
}

/* ---------------- self ---------------- */

function SelfProfile() {
  const { isLoggedIn, profile, loading, logout, openLogin } = useAuth();
  const favorites = useAtomValue(favoritesAtom);
  const stations = useAtomValue(customStationsAtom);
  const removeCustom = useSetAtom(removeCustomStationAtom);
  const openAddStation = useSetAtom(addStationOpenAtom);

  if (loading) {
    return <CenteredSpinner />;
  }

  if (!isLoggedIn) {
    return (
      <EmptyState
        icon={<IconUserCircle size={44} stroke={1.5} />}
        title="Sign in to see your dial"
        description="Log in with your Atmosphere account to save favorites and add your own stations."
        action={
          <Button
            variant="primary"
            className="gap-1.5 rounded-full"
            onPress={() => openLogin(true)}
          >
            <IconLogin2 size={16} />
            Sign in
          </Button>
        }
      />
    );
  }

  return (
    <ProfileView
      profile={profile}
      favorites={favorites}
      stations={stations}
      editable
      onRemove={(s) => removeCustom(s.id)}
      onAddStation={() => openAddStation(true)}
      onLogout={logout}
    />
  );
}

/* ---------------- public (any actor) ---------------- */

function PublicProfile({ actor }: { actor: string }) {
  const profileQuery = useQuery({
    queryKey: ["profile", actor],
    queryFn: () => getProfile(actor),
  });
  const dataQuery = useQuery({
    queryKey: ["public-user", actor],
    queryFn: () => readPublicUser(actor),
  });

  if (profileQuery.isLoading || dataQuery.isLoading) {
    return <CenteredSpinner />;
  }
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <EmptyState
        icon={<IconUserCircle size={44} stroke={1.5} />}
        title="Profile not found"
        description={`Couldn't find “${actor}”.`}
      />
    );
  }

  return (
    <ProfileView
      profile={profileQuery.data}
      favorites={(dataQuery.data?.favorites ?? []).map((f) => f.station)}
      stations={(dataQuery.data?.stations ?? []).map((s) => s.station)}
    />
  );
}

/* ---------------- shared view ---------------- */

interface ProfileViewProps {
  profile: ActorProfile | null;
  favorites: Station[];
  stations: Station[];
  editable?: boolean;
  onRemove?: (station: Station) => void;
  onAddStation?: () => void;
  onLogout?: () => void;
}

function ProfileView({
  profile,
  favorites,
  stations,
  editable = false,
  onRemove,
  onAddStation,
  onLogout,
}: ProfileViewProps) {
  const [tab, setTab] = useState<"favorites" | "custom">("favorites");

  const tabs = useMemo(
    () =>
      [
        {
          key: "favorites" as const,
          label: "Favorites",
          count: favorites.length,
          icon: IconHeart,
        },
        {
          key: "custom" as const,
          label: "Stations",
          count: stations.length,
          icon: IconBroadcast,
        },
      ],
    [favorites.length, stations.length],
  );

  const displayName = profile?.displayName || profile?.handle || "Listener";

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-synth-panel">
            {profile?.avatar ? (
              <img
                src={profile.avatar}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <IconUserCircle size={40} className="text-synth-cyan" stroke={1.5} />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold">
              {displayName}
            </h1>
            {profile?.handle && (
              <p className="truncate text-sm text-synth-cyan/90">
                @{profile.handle}
              </p>
            )}
            <div className="mt-1 flex gap-4 text-xs text-foreground/50">
              <span>
                <span className="font-semibold text-synth-cyan">
                  {favorites.length}
                </span>{" "}
                favorites
              </span>
              <span>
                <span className="font-semibold text-synth-cyan">
                  {stations.length}
                </span>{" "}
                stations
              </span>
            </div>
          </div>
        </div>

        {editable && (
          <div className="flex items-center gap-2">
            <Button
              variant="tertiary"
              className="gap-1.5 rounded-full !bg-white/5"
              onPress={onLogout}
            >
              <IconLogout size={16} />
              Log out
            </Button>
          </div>
        )}
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
                description={
                  editable
                    ? "Tap the heart on any station to save it here."
                    : "This user hasn't favorited any stations."
                }
              />
            ) : (
              <StationGrid stations={favorites} />
            ))}

          {tab === "custom" &&
            (stations.length === 0 ? (
              <EmptyState
                icon={<IconBroadcast size={40} stroke={1.5} />}
                title="No stations yet"
                description={
                  editable
                    ? "Add a stream that isn't listed with its name and URL."
                    : "This user hasn't added any stations."
                }
                action={
                  editable ? (
                    <Button
                      variant="primary"
                      className="gap-1.5 rounded-full"
                      onPress={onAddStation}
                    >
                      <IconPlus size={16} />
                      Add your first station
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <StationGrid
                stations={stations}
                onRemove={editable ? onRemove : undefined}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner color="accent" size="lg" />
    </div>
  );
}
