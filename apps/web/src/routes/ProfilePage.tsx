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
  IconSearch,
  IconHistory,
} from "@tabler/icons-react";
import { favoritesAtom } from "@/atoms/favorites";
import {
  customStationsAtom,
  removeCustomStationAtom,
} from "@/atoms/customStations";
import { addStationOpenAtom } from "@/atoms/ui";
import { useAuth } from "@/hooks/useAuth";
import { getProfile, type ActorProfile } from "@/lib/atproto/profile";
import * as appview from "@/lib/appview";
import { infoToStation } from "@atradio/lexicons";
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
  const { isLoggedIn, did, profile, loading, logout, openLogin } = useAuth();
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
      actor={did ?? profile?.handle}
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
  // Read the indexed data from the AppView XRPC (apps/api).
  const favQuery = useQuery({
    queryKey: ["appview-favorites", actor],
    queryFn: () => appview.getFavorites(actor, { limit: 100 }),
  });
  const staQuery = useQuery({
    queryKey: ["appview-stations", actor],
    queryFn: () => appview.getStations(actor, { limit: 100 }),
  });

  if (profileQuery.isLoading) {
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
      actor={actor}
      favorites={(favQuery.data?.items ?? []).map((v) => infoToStation(v.station))}
      stations={(staQuery.data?.items ?? []).map((v) => infoToStation(v.station))}
    />
  );
}

/* ---------------- shared view ---------------- */

interface ProfileViewProps {
  profile: ActorProfile | null;
  /** DID or handle used to read indexed data (recently played) from the AppView. */
  actor?: string;
  favorites: Station[];
  stations: Station[];
  editable?: boolean;
  onRemove?: (station: Station) => void;
  onAddStation?: () => void;
  onLogout?: () => void;
}

const selectClass =
  "h-8 rounded-lg border border-white/15 bg-synth-panel px-2 text-xs text-foreground focus:border-synth-cyan focus:outline-none";

function ProfileView({
  profile,
  actor,
  favorites,
  stations,
  editable = false,
  onRemove,
  onAddStation,
  onLogout,
}: ProfileViewProps) {
  const [tab, setTab] = useState<"favorites" | "custom" | "recent">(
    "favorites",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "name-desc">("recent");
  const [source, setSource] = useState<"all" | Station["source"]>("all");

  const recentQuery = useQuery({
    queryKey: ["appview-recently-played", actor],
    queryFn: () => appview.getRecentlyPlayed(actor!, { limit: 100 }),
    enabled: !!actor,
  });
  const recentlyPlayed = useMemo(
    () => (recentQuery.data?.items ?? []).map((v) => infoToStation(v.station)),
    [recentQuery.data],
  );

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
        {
          key: "recent" as const,
          label: "Recently played",
          count: recentlyPlayed.length,
          icon: IconHistory,
        },
      ],
    [favorites.length, stations.length, recentlyPlayed.length],
  );

  const activeList =
    tab === "favorites"
      ? favorites
      : tab === "custom"
        ? stations
        : recentlyPlayed;

  const visible = useMemo(() => {
    let list = activeList;
    if (source !== "all") list = list.filter((s) => s.source === source);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        [s.name, s.genre, s.country, s.description].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      );
    }
    if (sort === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "name-desc") {
      list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    }
    return list;
  }, [activeList, source, query, sort]);

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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {profile?.handle && (
                <a
                  href={`https://bsky.app/profile/${profile.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open on Bluesky"
                  className="truncate text-sm text-synth-cyan/90 hover:text-synth-cyan hover:underline"
                >
                  @{profile.handle}
                </a>
              )}
              {profile?.did && (
                <a
                  href={`https://pdsls.dev/at://${profile.did}`}
                  target="_blank"
                  rel="noreferrer"
                  title="View repo on PDSls"
                  className="text-xs text-foreground/40 hover:text-synth-cyan hover:underline"
                >
                  pdsls ↗
                </a>
              )}
            </div>
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

      {/* Tabs + controls */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10">
          <div
            role="tablist"
            aria-label="Profile sections"
            className="flex gap-6"
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

          {/* search / filter / sort */}
          <div className="flex items-center gap-2 pb-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-synth-panel px-2 focus-within:border-synth-cyan">
              <IconSearch size={14} className="text-foreground/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter…"
                aria-label="Filter stations"
                className="h-8 w-24 bg-transparent text-xs text-foreground placeholder:text-foreground/30 focus:outline-none sm:w-32"
              />
            </div>
            <select
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "all" | Station["source"])
              }
              aria-label="Filter by source"
              className={selectClass}
            >
              <option value="all">All sources</option>
              <option value="radio-browser">radio-browser</option>
              <option value="tunein">TuneIn</option>
              <option value="custom">Yours</option>
            </select>
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as "recent" | "name" | "name-desc")
              }
              aria-label="Sort"
              className={selectClass}
            >
              <option value="recent">Recent</option>
              <option value="name">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
            </select>
          </div>
        </div>

        <div className="pt-6">
          {activeList.length === 0 ? (
            tab === "favorites" ? (
              <EmptyState
                icon={<IconHeart size={40} stroke={1.5} />}
                title="No favorites yet"
                description={
                  editable
                    ? "Tap the heart on any station to save it here."
                    : "This user hasn't favorited any stations."
                }
              />
            ) : tab === "recent" ? (
              <EmptyState
                icon={<IconHistory size={40} stroke={1.5} />}
                title="Nothing played yet"
                description={
                  editable
                    ? "Stations you play will show up here."
                    : "This user hasn't played any stations yet."
                }
              />
            ) : (
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
            )
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<IconSearch size={40} stroke={1.5} />}
              title="No matches"
              description="Nothing matches your search or filters."
            />
          ) : (
            <StationGrid
              stations={visible}
              onRemove={editable && tab === "custom" ? onRemove : undefined}
            />
          )}
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
