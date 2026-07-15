import {
  IconWaveSine,
  IconHeadphones,
  IconMusic,
  IconDeviceSpeaker,
  IconPiano,
  IconGuitarPick,
  IconMicrophone2,
  IconDisc,
  IconVinyl,
  IconNews,
  IconWorld,
  IconMoodSmile,
  type Icon,
} from "@tabler/icons-react";

export interface Category {
  label: string;
  /** radio-browser tag used to browse the whole genre. */
  term: string;
  icon: Icon;
  color: string;
}

export const CATEGORIES: Category[] = [
  { label: "Synthwave", term: "synthwave", icon: IconWaveSine, color: "text-synth-pink" },
  { label: "Lo-fi", term: "lofi", icon: IconHeadphones, color: "text-synth-cyan" },
  { label: "Jazz", term: "jazz", icon: IconMusic, color: "text-synth-yellow" },
  { label: "Techno", term: "techno", icon: IconDeviceSpeaker, color: "text-synth-purple" },
  { label: "Ambient", term: "ambient", icon: IconWaveSine, color: "text-synth-cyan" },
  { label: "Classical", term: "classical", icon: IconPiano, color: "text-synth-magenta" },
  { label: "Rock", term: "rock", icon: IconGuitarPick, color: "text-synth-pink" },
  { label: "Pop", term: "pop", icon: IconMicrophone2, color: "text-synth-magenta" },
  { label: "Electronic", term: "electronic", icon: IconDisc, color: "text-synth-blue" },
  { label: "Hip-Hop", term: "hip hop", icon: IconVinyl, color: "text-synth-yellow" },
  { label: "Chillout", term: "chill", icon: IconMoodSmile, color: "text-synth-cyan" },
  { label: "Dance", term: "dance", icon: IconDeviceSpeaker, color: "text-synth-pink" },
  { label: "Reggae", term: "reggae", icon: IconMusic, color: "text-synth-yellow" },
  { label: "Metal", term: "metal", icon: IconGuitarPick, color: "text-synth-purple" },
  { label: "News", term: "news", icon: IconNews, color: "text-synth-cyan" },
  { label: "World", term: "world", icon: IconWorld, color: "text-synth-blue" },
];

/** URL-safe slug for a tag, e.g. "hip hop" → "hip-hop". */
export function categorySlug(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Reverse of {@link categorySlug}: "hip-hop" → "hip hop" (the browse tag). */
export function slugToTerm(slug: string): string {
  return decodeURIComponent(slug).replace(/-+/g, " ").trim();
}

/** Look up the known category for a slug, if it maps to one of our tiles. */
export function categoryBySlug(slug: string): Category | undefined {
  const term = slugToTerm(slug);
  return CATEGORIES.find((c) => c.term === term);
}
