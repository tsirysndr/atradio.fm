import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CATEGORIES, categorySlug } from "@/lib/categories";

export function CategoryGrid() {
  const { t } = useTranslation("browse");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-foreground/40">
        {t("browseByCategory")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {CATEGORIES.map(({ label, term, icon: Icon, color }) => (
          <Link
            key={label}
            to="/browse/$category"
            params={{ category: categorySlug(term) }}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-synth-surface/60 px-4 py-3 text-left transition-colors hover:border-synth-cyan/60"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 ${color}`}
            >
              <Icon size={18} stroke={1.75} />
            </span>
            <span className="truncate font-display text-sm font-medium text-foreground/90">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
