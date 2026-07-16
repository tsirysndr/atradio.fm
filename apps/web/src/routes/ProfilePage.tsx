import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@heroui/react";
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
import { ProfileSkeleton } from "@/components/Skeletons";
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
  const { t } = useTranslation(["profile", "common"]);
  const { isLoggedIn, did, profile, loading, logout, openLogin } = useAuth();
  const favorites = useAtomValue(favoritesAtom);
  const stations = useAtomValue(customStationsAtom);
  const removeCustom = useSetAtom(removeCustomStationAtom);
  const openAddStation = useSetAtom(addStationOpenAtom);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!isLoggedIn) {
    return (
      <EmptyState
        icon={<IconUserCircle size={44} stroke={1.5} />}
        title={t("signInPrompt.title")}
        description={t("signInPrompt.description")}
        action={
          <Button
            variant="primary"
            className="gap-1.5 rounded-full"
            onPress={() => openLogin(true)}
          >
            <IconLogin2 size={16} />
            {t("signIn", { ns: "common" })}
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
  const { t } = useTranslation("profile");
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
    return <ProfileSkeleton />;
  }
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <EmptyState
        icon={<IconUserCircle size={44} stroke={1.5} />}
        title={t("notFound.title")}
        description={t("notFound.description", { actor })}
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
  const { t } = useTranslation(["profile", "common"]);
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
          label: t("tabs.favorites", { count: favorites.length }),
          count: favorites.length,
          icon: IconHeart,
        },
        {
          key: "custom" as const,
          label: t("tabs.stations", { count: stations.length }),
          count: stations.length,
          icon: IconBroadcast,
        },
        {
          key: "recent" as const,
          label: t("tabs.recent", { count: recentlyPlayed.length }),
          count: recentlyPlayed.length,
          icon: IconHistory,
        },
      ],
    [t, favorites.length, stations.length, recentlyPlayed.length],
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

  const displayName =
    profile?.displayName || profile?.handle || t("displayNameFallback");

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
                  title={t("links.bluesky")}
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
                  title={t("links.pdsls")}
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
                {t("header.favorites", { count: favorites.length })}
              </span>
              <span>
                <span className="font-semibold text-synth-cyan">
                  {stations.length}
                </span>{" "}
                {t("header.stations", { count: stations.length })}
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
              {t("logout")}
            </Button>
          </div>
        )}
      </section>

      {/* Tabs + controls */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10">
          <div
            role="tablist"
            aria-label={t("tabs.sectionsLabel")}
            className="flex gap-6"
          >
            {tabs.map(({ key, label, icon: Icon }) => {
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
                  {label}
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
                placeholder={t("filter.placeholder")}
                aria-label={t("filter.stationsLabel")}
                className="h-8 w-24 bg-transparent text-xs text-foreground placeholder:text-foreground/30 focus:outline-none sm:w-32"
              />
            </div>
            <select
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "all" | Station["source"])
              }
              aria-label={t("filter.sourceLabel")}
              className={selectClass}
            >
              <option value="all">{t("sources.all")}</option>
              <option value="radio-browser">radio-browser</option>
              <option value="tunein">TuneIn</option>
              <option value="custom">{t("sources.custom")}</option>
            </select>
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as "recent" | "name" | "name-desc")
              }
              aria-label={t("filter.sortLabel")}
              className={selectClass}
            >
              <option value="recent">{t("sort.recent")}</option>
              <option value="name">{t("sort.nameAsc")}</option>
              <option value="name-desc">{t("sort.nameDesc")}</option>
            </select>
          </div>
        </div>

        <div className="pt-6">
          {activeList.length === 0 ? (
            tab === "favorites" ? (
              <EmptyState
                icon={<IconHeart size={40} stroke={1.5} />}
                title={t("empty.favoritesTitle")}
                description={
                  editable
                    ? t("empty.favoritesSelf")
                    : t("empty.favoritesOther")
                }
              />
            ) : tab === "recent" ? (
              <EmptyState
                icon={<IconHistory size={40} stroke={1.5} />}
                title={t("empty.recentTitle")}
                description={
                  editable ? t("empty.recentSelf") : t("empty.recentOther")
                }
              />
            ) : (
              <EmptyState
                icon={<IconBroadcast size={40} stroke={1.5} />}
                title={t("empty.stationsTitle")}
                description={
                  editable
                    ? t("empty.stationsSelf")
                    : t("empty.stationsOther")
                }
                action={
                  editable ? (
                    <Button
                      variant="primary"
                      className="gap-1.5 rounded-full"
                      onPress={onAddStation}
                    >
                      <IconPlus size={16} />
                      {t("empty.addFirst")}
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<IconSearch size={40} stroke={1.5} />}
              title={t("empty.noMatchesTitle")}
              description={t("empty.noMatchesDescription")}
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
