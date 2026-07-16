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

/** Skeleton placeholder that mirrors a single comment row while loading. */
export function CommentSkeleton() {
  return (
    <ContentLoader
      speed={2}
      viewBox="0 0 300 60"
      backgroundColor={BG}
      foregroundColor={FG}
      style={{ width: "100%", height: "auto" }}
    >
      {/* avatar */}
      <circle cx="16" cy="16" r="16" />
      {/* name + timestamp */}
      <rect x="42" y="4" rx="4" width="90" height="12" />
      <rect x="140" y="5" rx="4" width="32" height="10" />
      {/* two lines of body text */}
      <rect x="42" y="26" rx="4" width="230" height="9" />
      <rect x="42" y="42" rx="4" width="160" height="9" />
    </ContentLoader>
  );
}

/** A stack of comment skeletons shown while the comments list loads. */
export function CommentsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }, (_, i) => (
        <CommentSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for the profile header (avatar + name + handle + stats). */
export function ProfileHeaderSkeleton() {
  return (
    <ContentLoader
      speed={2}
      viewBox="0 0 400 80"
      backgroundColor={BG}
      foregroundColor={FG}
      style={{ width: "100%", maxWidth: 400, height: "auto" }}
    >
      {/* avatar */}
      <rect x="0" y="0" rx="16" ry="16" width="64" height="64" />
      {/* display name */}
      <rect x="80" y="6" rx="5" width="180" height="20" />
      {/* handle */}
      <rect x="80" y="34" rx="4" width="120" height="12" />
      {/* stats */}
      <rect x="80" y="56" rx="4" width="70" height="12" />
      <rect x="162" y="56" rx="4" width="70" height="12" />
    </ContentLoader>
  );
}

/** Full profile-page loading state: header + a grid of station skeletons. */
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <ProfileHeaderSkeleton />
      <div className="border-b border-white/10 pb-3">
        <ContentLoader
          speed={2}
          viewBox="0 0 300 20"
          backgroundColor={BG}
          foregroundColor={FG}
          style={{ width: "100%", maxWidth: 300, height: "auto" }}
        >
          <rect x="0" y="4" rx="4" width="80" height="12" />
          <rect x="100" y="4" rx="4" width="80" height="12" />
          <rect x="200" y="4" rx="4" width="80" height="12" />
        </ContentLoader>
      </div>
      <StationGridSkeleton count={8} />
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
