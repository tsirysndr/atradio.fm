import { useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { IconGif, IconSend, IconX, IconMoodSmile } from "@tabler/icons-react";
import { consola } from "consola";
import { stationToInfo, type CommentView } from "@atradio/lexicons";
import type { Station } from "@/lib/types";
import { clientAtom, didAtom, authProfileAtom } from "@/atoms/auth";
import { putComment } from "@/lib/atproto/records";
import {
  resolveMentionFacets,
  searchActorsTypeahead,
} from "@/lib/atproto/richtext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { MediaResult } from "@/lib/api/klipy";
import { MediaPicker } from "./MediaPicker";

/** Find the `@token` the caret currently sits in (for the mention popup). */
function activeMentionToken(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      const before = i === 0 ? " " : text[i - 1];
      if (i === 0 || /[\s(]/.test(before)) {
        return { start: i, query: text.slice(i + 1, caret) };
      }
      return null;
    }
    if (!/[a-zA-Z0-9.\-]/.test(ch)) return null;
    i--;
  }
  return null;
}

interface CommentComposerProps {
  station: Station;
  /** Called with the freshly-created comment so the list can prepend it. */
  onPosted: (comment: CommentView) => void;
  autoFocus?: boolean;
}

export function CommentComposer({
  station,
  onPosted,
  autoFocus,
}: CommentComposerProps) {
  const client = useAtomValue(clientAtom);
  const did = useAtomValue(didAtom);
  const profile = useAtomValue(authProfileAtom);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState("");
  const [gif, setGif] = useState<MediaResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerState = useOverlayState({
    isOpen: pickerOpen,
    onOpenChange: setPickerOpen,
  });

  // Mention autocomplete state.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const debouncedQuery = useDebouncedValue(mention?.query ?? "", 200);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["mention-typeahead", debouncedQuery],
    queryFn: () => searchActorsTypeahead(debouncedQuery),
    enabled: mention !== null && debouncedQuery.length >= 1,
    staleTime: 30_000,
  });
  const popupOpen = mention !== null && suggestions.length > 0;

  const syncMention = (value: string, caret: number) => {
    setMention(activeMentionToken(value, caret));
    setActiveIdx(0);
  };

  const insertMention = (handle: string) => {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const next =
      text.slice(0, mention.start) + `@${handle} ` + text.slice(caret);
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + handle.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const canSubmit = (text.trim().length > 0 || gif !== null) && !busy;

  const submit = async () => {
    if (!client || !did || !canSubmit) return;
    setBusy(true);
    try {
      const body = text.trim();
      const facets = await resolveMentionFacets(body);
      const gifEmbed = gif
        ? {
            url: gif.url,
            previewUrl: gif.previewUrl,
            alt: gif.alt,
            width: gif.width,
            height: gif.height,
          }
        : undefined;
      const { uri } = await putComment(client, did, station, body, {
        facets,
        gif: gifEmbed,
      });
      onPosted({
        uri,
        author: {
          did,
          handle: profile?.handle,
          displayName: profile?.displayName,
          avatar: profile?.avatar,
        },
        station: stationToInfo(station),
        text: body,
        facets: facets.length ? facets : undefined,
        gif: gifEmbed,
        createdAt: new Date().toISOString(),
      });
      setText("");
      setGif(null);
      setMention(null);
    } catch (err) {
      consola.error("[comments] post failed", err);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popupOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(suggestions[activeIdx]!.handle);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    // Cmd/Ctrl+Enter submits; plain Enter keeps a newline.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const avatar = useMemo(() => profile?.avatar, [profile]);

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-synth-panel">
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <IconMoodSmile size={16} className="text-foreground/50" />
          )}
        </span>

        <div className="flex-1">
          <div className="rounded-2xl border border-white/10 bg-synth-panel focus-within:border-synth-cyan/60">
            <textarea
              ref={textareaRef}
              value={text}
              autoFocus={autoFocus}
              onChange={(e) => {
                setText(e.target.value);
                syncMention(e.target.value, e.target.selectionStart ?? 0);
              }}
              onClick={(e) =>
                syncMention(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart ?? 0,
                )
              }
              onKeyUp={(e) =>
                syncMention(
                  e.currentTarget.value,
                  e.currentTarget.selectionStart ?? 0,
                )
              }
              onKeyDown={onKeyDown}
              rows={4}
              placeholder="Add a comment… use @ to mention"
              className="min-h-[6rem] max-h-52 w-full resize-y bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none"
            />

            {gif && (
              <div className="relative mx-3 mb-2 w-fit max-w-[12rem] overflow-hidden rounded-xl border border-white/10">
                {gif.isVideo ? (
                  <video
                    src={gif.url}
                    className="w-full"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img src={gif.previewUrl ?? gif.url} alt={gif.alt ?? ""} className="w-full" />
                )}
                <button
                  type="button"
                  onClick={() => setGif(null)}
                  aria-label="Remove GIF"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <IconX size={14} />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between px-2 pb-2">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                aria-label="Add a GIF"
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
                  pickerOpen
                    ? "bg-synth-pink/20 text-synth-pink"
                    : "text-foreground/50 hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <IconGif size={16} />
                GIF
              </button>

              <Button
                size="sm"
                variant="primary"
                className="gap-1 rounded-full"
                isDisabled={!canSubmit}
                onPress={() => void submit()}
              >
                <IconSend size={14} />
                Post
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mention suggestions popup */}
      {popupOpen && (
        <ul className="absolute left-10 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-white/10 bg-synth-surface shadow-2xl shadow-black/50">
          {suggestions.map((s, i) => (
            <li key={s.did}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(s.handle);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  i === activeIdx ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-synth-panel">
                  {s.avatar ? (
                    <img src={s.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <IconMoodSmile size={14} className="text-foreground/40" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-foreground">
                    {s.displayName || s.handle}
                  </span>
                  <span className="block truncate text-xs text-foreground/40">
                    @{s.handle}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Media (GIF/sticker/clip/meme) picker — a nested HeroUI modal so it gets
          its own focus scope (typing + clicks work above the comments modal) and
          the tall grid is never clipped by a scrolling container. */}
      <Modal state={pickerState}>
        {/* Above the fullscreen player (z-60) so the picker isn't hidden when
            opened from the player's comments. */}
        <Modal.Backdrop variant="blur" style={{ zIndex: 200 }}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="mx-4 w-[calc(100vw-2rem)] max-w-sm border border-white/10 bg-synth-surface p-3">
              <MediaPicker
                onSelect={(m) => {
                  setGif(m);
                  setPickerOpen(false);
                }}
                onClose={() => setPickerOpen(false)}
              />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
