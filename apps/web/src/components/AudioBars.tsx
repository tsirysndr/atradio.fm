interface AudioBarsProps {
  active?: boolean;
  className?: string;
}

/** Tiny equalizer-style animation used as a "now playing" indicator. */
export function AudioBars({ active = true, className = "" }: AudioBarsProps) {
  const delays = ["0ms", "160ms", "320ms", "80ms", "240ms"];
  return (
    <div
      className={`flex h-4 items-end gap-[2px] ${className}`}
      aria-hidden="true"
    >
      {delays.map((delay, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-synth-cyan"
          style={{
            height: "100%",
            animation: active
              ? "pulse-bars 0.9s ease-in-out infinite"
              : "none",
            animationDelay: delay,
            transform: active ? undefined : "scaleY(0.35)",
          }}
        />
      ))}
    </div>
  );
}
