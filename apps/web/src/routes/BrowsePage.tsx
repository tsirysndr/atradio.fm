import { useEffect, useRef } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconMusic,
  IconMoodEmpty,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { StationGrid } from "@/components/StationGrid";
import { StationGridSkeleton } from "@/components/Skeletons";
import { EmptyState } from "@/components/EmptyState";
import { useCategoryStations } from "@/hooks/useCategoryStations";
import { categoryBySlug, slugToTerm } from "@/lib/categories";

export function BrowsePage() {
  const { category } = useParams({ from: "/browse/$category" });
  const known = categoryBySlug(category);
  const tag = known?.term ?? slugToTerm(category);
  const label =
    known?.label ?? tag.replace(/\b\w/g, (c) => c.toUpperCase());
  const Icon = known?.icon ?? IconMusic;
  const color = known?.color ?? "text-synth-cyan";

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCategoryStations(tag);

  const stations = data?.stations ?? [];

  // Infinite scroll: fetch the next page when a sentinel near the bottom of the
  // list scrolls into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-foreground/50 transition-colors hover:text-synth-cyan"
        >
          <IconArrowLeft size={16} />
          Back
        </Link>

        <div className="flex items-center gap-4">
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/5 ${color}`}
          >
            <Icon size={28} stroke={1.75} />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {label}
            </h1>
            <p className="text-sm text-foreground/50">
              {isLoading
                ? "Loading stations…"
                : `${stations.length}${hasNextPage ? "+" : ""} station${
                    stations.length === 1 ? "" : "s"
                  }`}
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <StationGridSkeleton count={8} />
      ) : isError ? (
        <EmptyState
          icon={<IconAlertTriangle size={40} stroke={1.5} />}
          title="Couldn't load stations"
          description="Something went wrong reaching the station directory. Try again in a moment."
        />
      ) : stations.length === 0 ? (
        <EmptyState
          icon={<IconMoodEmpty size={40} stroke={1.5} />}
          title={`No ${label} stations found`}
          description="Try another category or search for a station by name."
        />
      ) : (
        <>
          <StationGrid stations={stations} />

          {/* Sentinel + loading state for the next page. */}
          <div ref={sentinelRef} className="min-h-4">
            {isFetchingNextPage && <StationGridSkeleton count={4} />}
          </div>

          {!hasNextPage && (
            <p className="py-6 text-center text-sm text-foreground/40">
              You've reached the end of {label}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
