import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IconMessage2, IconMoodSmile, IconLogin2 } from "@tabler/icons-react";
import { Spinner } from "@heroui/react";
import type { CommentView, LiveEvent } from "@atradio/lexicons";
import type { Station } from "@/lib/types";
import { isLoggedInAtom } from "@/atoms/auth";
import { useAuth } from "@/hooks/useAuth";
import { useStationLive } from "@/hooks/useStationLive";
import { getComments } from "@/lib/appview";
import { segmentComment } from "@/lib/atproto/richtext";
import { timeAgo } from "@/lib/time";
import { isVideoUrl } from "@/lib/api/klipy";
import { CommentComposer } from "./CommentComposer";

/** Render one comment: author, segmented text w/ mention links, optional GIF. */
function CommentItem({ comment }: { comment: CommentView }) {
  const author = comment.author;
  const name = author?.displayName || author?.handle || "someone";
  const segments = useMemo(
    () => segmentComment(comment.text, comment.facets),
    [comment.text, comment.facets],
  );

  return (
    <li className="flex gap-2.5">
      <Link
        to="/profile/$actor"
        params={{ actor: author?.handle ?? author?.did ?? "" }}
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-synth-panel"
      >
        {author?.avatar ? (
          <img src={author.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <IconMoodSmile size={16} className="text-foreground/50" />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <Link
            to="/profile/$actor"
            params={{ actor: author?.handle ?? author?.did ?? "" }}
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {name}
          </Link>
          <span className="truncate text-xs text-foreground/40">
            {timeAgo(comment.createdAt)}
          </span>
        </div>

        {comment.text && (
          <p className="whitespace-pre-wrap break-words text-sm text-foreground/85">
            {segments.map((seg, i) =>
              seg.type === "mention" ? (
                <Link
                  key={i}
                  to="/profile/$actor"
                  params={{ actor: seg.did }}
                  className="font-medium text-synth-cyan hover:underline"
                >
                  {seg.value}
                </Link>
              ) : (
                <span key={i}>{seg.value}</span>
              ),
            )}
          </p>
        )}

        {comment.gif?.url && (
          <div className="mt-1.5 w-fit max-w-[14rem] overflow-hidden rounded-xl border border-white/10">
            {isVideoUrl(comment.gif.url) ? (
              <video
                src={comment.gif.url}
                className="w-full"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img
                src={comment.gif.url}
                alt={comment.gif.alt ?? ""}
                loading="lazy"
                className="w-full"
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

interface CommentsPanelProps {
  station: Station;
  /** Cap the visible height with an internal scroll (e.g. inside the player). */
  className?: string;
}

/** Live comments list + composer for a station. */
export function CommentsPanel({ station, className }: CommentsPanelProps) {
  const isLoggedIn = useAtomValue(isLoggedInAtom);
  const { openLogin } = useAuth();

  // Comments added locally (optimistic + live SSE), newest first.
  const [local, setLocal] = useState<CommentView[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["comments", station.id],
    queryFn: () => getComments(station.id, { limit: 50 }),
    // Polling fallback in case the SSE stream drops.
    refetchInterval: 20_000,
  });

  useStationLive(station.id, (event: LiveEvent) => {
    if (event.type !== "comment") return;
    const c = event.comment;
    setLocal((prev) =>
      prev.some((x) => x.uri === c.uri) ? prev : [c, ...prev],
    );
  });

  const comments = useMemo(() => {
    const byUri = new Map<string, CommentView>();
    for (const c of data?.items ?? []) byUri.set(c.uri, c);
    // Local (optimistic/live) wins over the server copy.
    for (const c of local) byUri.set(c.uri, c);
    return [...byUri.values()].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data, local]);

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {isLoggedIn ? (
        <CommentComposer
          station={station}
          onPosted={(c) =>
            setLocal((prev) =>
              prev.some((x) => x.uri === c.uri) ? prev : [c, ...prev],
            )
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => openLogin(true)}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-synth-panel/60 px-3 py-2.5 text-sm text-foreground/60 hover:text-foreground"
        >
          <IconLogin2 size={15} />
          Sign in to comment
        </button>
      )}

      <ul className="flex flex-col gap-4">
        {isLoading && comments.length === 0 ? (
          <li className="flex justify-center py-6">
            <Spinner color="accent" size="sm" />
          </li>
        ) : comments.length === 0 ? (
          <li className="flex flex-col items-center gap-1 py-8 text-center text-sm text-foreground/40">
            <IconMessage2 size={22} className="text-foreground/30" />
            No comments yet — say something!
          </li>
        ) : (
          comments.map((c) => <CommentItem key={c.uri} comment={c} />)
        )}
      </ul>
    </div>
  );
}
