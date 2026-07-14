import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-synth-surface/40 px-6 py-16 text-center">
      <div className="text-synth-purple">{icon}</div>
      <h3 className="font-display text-lg font-semibold text-foreground">
        {title}
      </h3>
      {description && (
        <p className="max-w-md text-sm text-foreground/60">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
