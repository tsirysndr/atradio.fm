import ContentLoader from "react-content-loader";

const BG = "#18222d";
const FG = "#2a3a47";

/** Skeleton placeholder that mirrors a StationCard while results load. */
export function StationCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-synth-surface/70 p-4">
      <ContentLoader
        speed={2}
        viewBox="0 0 300 140"
        backgroundColor={BG}
        foregroundColor={FG}
        style={{ width: "100%", height: "auto" }}
      >
        <rect x="0" y="0" rx="8" ry="8" width="52" height="52" />
        <rect x="64" y="6" rx="4" width="150" height="14" />
        <rect x="64" y="30" rx="4" width="90" height="10" />
        <rect x="0" y="72" rx="6" width="58" height="16" />
        <rect x="64" y="72" rx="6" width="44" height="16" />
        <rect x="0" y="106" rx="16" width="196" height="30" />
        <rect x="208" y="106" rx="16" width="30" height="30" />
        <rect x="246" y="106" rx="16" width="30" height="30" />
      </ContentLoader>
    </div>
  );
}

/** A grid of station-card skeletons matching the results layout. */
export function StationGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <StationCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Small inline shimmer bar, used in place of a spinner for short waits. */
export function InlineLoader({ width = 120 }: { width?: number }) {
  return (
    <ContentLoader
      speed={1.5}
      width={width}
      height={10}
      viewBox={`0 0 ${width} 10`}
      backgroundColor={BG}
      foregroundColor="#00c6e8"
      style={{ opacity: 0.6 }}
    >
      <rect x="0" y="2" rx="4" width={width} height="6" />
    </ContentLoader>
  );
}
