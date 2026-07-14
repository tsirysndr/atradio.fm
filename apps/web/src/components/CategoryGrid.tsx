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

interface Category {
  label: string;
  /** Search term sent to the providers. */
  term: string;
  icon: Icon;
  color: string;
}

const CATEGORIES: Category[] = [
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

interface CategoryGridProps {
  onSelect: (term: string) => void;
}

export function CategoryGrid({ onSelect }: CategoryGridProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-foreground/40">
        Browse by category
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {CATEGORIES.map(({ label, term, icon: Icon, color }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(term)}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-synth-surface/60 px-4 py-3 text-left"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 ${color}`}
            >
              <Icon size={18} stroke={1.75} />
            </span>
            <span className="truncate font-display text-sm font-medium text-foreground/90">
              {label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
