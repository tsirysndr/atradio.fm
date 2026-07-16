import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconCheck, IconWorld } from "@tabler/icons-react";
import {
  SUPPORTED_LANGUAGES,
  changeLanguage,
  type LanguageCode,
} from "@/i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation("navbar");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = i18n.language as LanguageCode;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:text-foreground"
        title={t("changeLanguage")}
        aria-label={t("changeLanguage")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <IconWorld size={18} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 min-w-40 overflow-hidden rounded-xl border border-white/10 bg-synth-panel/95 p-1 shadow-xl backdrop-blur-xl"
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = lang.code === current;
            return (
              <button
                key={lang.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  changeLanguage(lang.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-white/5 text-foreground"
                    : "text-foreground/70 hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <span className="text-base leading-none">{lang.flag}</span>
                <span className="flex-1 text-left">{lang.label}</span>
                {active && <IconCheck size={15} className="text-synth-cyan" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
