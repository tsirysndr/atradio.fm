import type { Mention } from "@atradio/lexicons";
import { getProfile } from "./profile";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** UTF-8 byte length of a string (facets index by bytes, not code units). */
function byteLength(s: string): number {
  return encoder.encode(s).length;
}

/**
 * Handle mentions like `@alice.bsky.social`. Matches the leading `@` plus a
 * dotted handle; the capture excludes any trailing punctuation.
 */
const MENTION_RE = /(^|[\s(])@([a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]|[a-zA-Z0-9])/g;

export interface MentionSpan {
  /** String (code-unit) index of the `@`. */
  start: number;
  /** String index just past the handle. */
  end: number;
  /** Handle without the leading `@`. */
  handle: string;
}

/** Find `@handle` spans in text (string indices, for editor highlighting). */
export function detectMentionSpans(text: string): MentionSpan[] {
  const spans: MentionSpan[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const lead = m[1] ?? "";
    const handle = m[2];
    if (!handle) continue;
    const at = (m.index ?? 0) + lead.length;
    spans.push({ start: at, end: at + 1 + handle.length, handle });
  }
  return spans;
}

/**
 * Resolve every `@handle` in `text` to a mention facet (UTF-8 byte range → DID).
 * Handles that don't resolve are silently dropped. Resolution is cached per call
 * so a handle mentioned twice is only fetched once.
 */
export async function resolveMentionFacets(text: string): Promise<Mention[]> {
  const spans = detectMentionSpans(text);
  if (spans.length === 0) return [];

  const cache = new Map<string, string | null>();
  const resolve = async (handle: string): Promise<string | null> => {
    const key = handle.toLowerCase();
    if (cache.has(key)) return cache.get(key)!;
    let did: string | null = null;
    try {
      did = (await getProfile(handle)).did;
    } catch {
      did = null;
    }
    cache.set(key, did);
    return did;
  };

  const facets: Mention[] = [];
  for (const span of spans) {
    const did = await resolve(span.handle);
    if (!did) continue;
    facets.push({
      did,
      byteStart: byteLength(text.slice(0, span.start)),
      byteEnd: byteLength(text.slice(0, span.end)),
    });
  }
  return facets;
}

export type CommentSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; did: string };

/**
 * Split a comment's text into plain + mention segments using its facets, so the
 * UI can render mentions as links. Byte offsets are mapped back onto the string.
 */
export function segmentComment(
  text: string,
  facets: Mention[] | undefined,
): CommentSegment[] {
  if (!facets?.length) return [{ type: "text", value: text }];
  const bytes = encoder.encode(text);
  const sorted = [...facets].sort((a, b) => a.byteStart - b.byteStart);
  const segments: CommentSegment[] = [];
  let cursor = 0;
  for (const f of sorted) {
    if (f.byteStart < cursor || f.byteEnd > bytes.length || f.byteEnd <= f.byteStart)
      continue;
    if (f.byteStart > cursor) {
      segments.push({
        type: "text",
        value: decoder.decode(bytes.slice(cursor, f.byteStart)),
      });
    }
    segments.push({
      type: "mention",
      value: decoder.decode(bytes.slice(f.byteStart, f.byteEnd)),
      did: f.did,
    });
    cursor = f.byteEnd;
  }
  if (cursor < bytes.length) {
    segments.push({ type: "text", value: decoder.decode(bytes.slice(cursor)) });
  }
  return segments;
}

export interface ActorSuggestion {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

/** Typeahead actor search (Bluesky AppView) for the mention autocomplete. */
export async function searchActorsTypeahead(
  q: string,
  limit = 6,
): Promise<ActorSuggestion[]> {
  const query = q.trim();
  if (!query) return [];
  const url =
    "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=" +
    encodeURIComponent(query) +
    `&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const d = (await res.json()) as {
      actors?: {
        did: string;
        handle: string;
        displayName?: string;
        avatar?: string;
      }[];
    };
    return (d.actors ?? []).map((a) => ({
      did: a.did,
      handle: a.handle,
      displayName: a.displayName,
      avatar: a.avatar,
    }));
  } catch {
    return [];
  }
}
