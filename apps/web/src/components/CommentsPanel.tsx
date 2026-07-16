import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  IconMessage2,
  IconMoodSmile,
  IconLogin2,
  IconTrash,
  IconPencil,
} from "@tabler/icons-react";
import { Button, Modal, Spinner, useOverlayState } from "@heroui/react";
import { consola } from "consola";
import type { CommentView, LiveEvent } from "@atradio/lexicons";
import type { Station } from "@/lib/types";
import { clientAtom, didAtom, isLoggedInAtom } from "@/atoms/auth";
import { useAuth } from "@/hooks/useAuth";
import { useStationLive } from "@/hooks/useStationLive";
import { getComments } from "@/lib/appview";
import { deleteComment } from "@/lib/atproto/records";
import { segmentComment } from "@/lib/atproto/richtext";
import { timeAgo } from "@/lib/time";
import { isVideoUrl } from "@/lib/api/klipy";
import { CommentComposer } from "./CommentComposer";

/** Render one comment: author, segmented text w/ mention links, optional GIF. */
function CommentItem({
  comment,
  canModify,
  onEdit,
  onDelete,
  editor,
}: {
  comment: CommentView;
  canModify: boolean;
  onEdit: (comment: CommentView) => void;
  onDelete: (comment: CommentView) => void;
  /** When set, an inline editor replaces the comment body. */
  editor?: React.ReactNode;
}) {
  const author = comment.author;
  const name = author?.displayName || author?.handle || "someone";
  const segments = useMemo(
    () => segmentComment(comment.text, comment.facets),
    [comment.text, comment.facets],
  );

  return (
    <li className="group flex gap-2.5">
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
          {canModify && !editor && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onEdit(comment)}
                aria-label="Edit comment"
                title="Edit comment"
                className="rounded-full p-1 text-foreground/30 transition-colors hover:bg-white/5 hover:text-synth-cyan"
              >
                <IconPencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(comment)}
                aria-label="Delete comment"
                title="Delete comment"
                className="rounded-full p-1 text-foreground/30 transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <IconTrash size={14} />
              </button>
            </span>
          )}
        </div>

        {editor ? (
          <div className="mt-1.5">{editor}</div>
        ) : (
          <>
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
          </>
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
  const client = useAtomValue(clientAtom);
  const did = useAtomValue(didAtom);
  const { openLogin } = useAuth();

  // Comments added locally (optimistic + live SSE), newest first.
  const [local, setLocal] = useState<CommentView[]>([]);
  // URIs the user just deleted (filtered out until the server catches up).
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  // The comment currently being edited inline (by uri).
  const [editingUri, setEditingUri] = useState<string | null>(null);
  // The single comment queued for delete confirmation (null = dialog closed).
  const [confirmTarget, setConfirmTarget] = useState<CommentView | null>(null);
  const confirmState = useOverlayState({
    isOpen: confirmTarget !== null,
    onOpenChange: (open) => {
      if (!open) setConfirmTarget(null);
    },
  });

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

  /** Insert or replace a comment in the local (optimistic/live) list. */
  const upsertLocal = (c: CommentView) =>
    setLocal((prev) => {
      const rest = prev.filter((x) => x.uri !== c.uri);
      return [c, ...rest];
    });

  /** Delete exactly one comment (by its own at-uri) after confirmation. */
  const performDelete = async (comment: CommentView) => {
    setConfirmTarget(null);
    const uri = comment.uri;
    // Guard: never proceed without a concrete uri to scope the delete to.
    if (!client || !did || !uri) return;
    setDeleted((prev) => new Set(prev).add(uri));
    setLocal((prev) => prev.filter((x) => x.uri !== uri));
    if (editingUri === uri) setEditingUri(null);
    try {
      await deleteComment(client, did, uri);
      consola.info("[comments] deleted", uri);
    } catch (err) {
      consola.error("[comments] delete failed", err);
      // Roll back so it reappears rather than silently vanishing.
      setDeleted((prev) => {
        const next = new Set(prev);
        next.delete(uri);
        return next;
      });
    }
  };

  const comments = useMemo(() => {
    const byUri = new Map<string, CommentView>();
    for (const c of data?.items ?? []) byUri.set(c.uri, c);
    // Local (optimistic/live) wins over the server copy.
    for (const c of local) byUri.set(c.uri, c);
    for (const uri of deleted) byUri.delete(uri);
    return [...byUri.values()].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data, local, deleted]);

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
          comments.map((c) => {
            const mine = !!did && c.author?.did === did;
            const editor =
              mine && editingUri === c.uri ? (
                <CommentComposer
                  station={station}
                  autoFocus
                  edit={{
                    uri: c.uri,
                    createdAt: c.createdAt,
                    text: c.text,
                    gif: c.gif,
                  }}
                  onCancel={() => setEditingUri(null)}
                  onPosted={(updated) => {
                    setEditingUri(null);
                    upsertLocal(updated);
                  }}
                />
              ) : undefined;
            return (
              <CommentItem
                key={c.uri}
                comment={c}
                canModify={mine}
                onEdit={(cc) => setEditingUri(cc.uri)}
                onDelete={(cc) => setConfirmTarget(cc)}
                editor={editor}
              />
            );
          })
        )}
      </ul>

      {/* Delete confirmation — scoped to the one selected comment. */}
      <Modal state={confirmState}>
        <Modal.Backdrop variant="blur" style={{ zIndex: 210 }}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="mx-4 w-[calc(100vw-2rem)] max-w-sm border border-white/10 bg-synth-surface">
              <Modal.Header className="border-b border-white/10 pb-3">
                <Modal.Heading className="flex items-center gap-1.5 font-display text-base">
                  <IconTrash size={16} className="text-danger" />
                  Delete comment?
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3 py-4">
                <p className="text-sm text-foreground/70">
                  This permanently deletes this one comment. It can't be undone.
                </p>
                {confirmTarget && (confirmTarget.text || confirmTarget.gif) && (
                  <div className="rounded-xl border border-white/10 bg-synth-panel/60 px-3 py-2">
                    {confirmTarget.text && (
                      <p className="line-clamp-3 text-xs text-foreground/60">
                        {confirmTarget.text}
                      </p>
                    )}
                    {confirmTarget.gif?.url && (
                      <p className="mt-0.5 text-xs italic text-foreground/40">
                        [GIF]
                      </p>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="tertiary"
                    className="rounded-full !bg-white/5"
                    onPress={() => setConfirmTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="rounded-full !bg-danger !text-white hover:!bg-danger/90"
                    onPress={() => confirmTarget && void performDelete(confirmTarget)}
                  >
                    Delete
                  </Button>
                </div>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
