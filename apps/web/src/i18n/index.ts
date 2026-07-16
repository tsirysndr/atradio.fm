import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Supported languages. Add a locale by dropping `locales/<lang>/<ns>.json`
// files in — they are auto-discovered by the glob below, no wiring needed.
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const STORAGE_KEY = "atradio.lang";

// Eagerly bundle every `src/i18n/locales/<lang>/<namespace>.json` into the
// i18next `resources` map. Feature areas own their own namespace file, so
// translation work across components never collides on one big JSON.
const modules = import.meta.glob<Record<string, unknown>>(
  "./locales/*/*.json",
  { eager: true, import: "default" },
);

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const path in modules) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  resources[lang] ??= {};
  resources[lang][ns] = modules[path];
}

// A previously chosen language persists across visits. Otherwise autodetect
// from the browser, falling back to English for unsupported locales.
function detectLanguage(): LanguageCode {
  const stored =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
  if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
    return stored as LanguageCode;
  }
  const nav =
    typeof navigator !== "undefined"
      ? navigator.language.slice(0, 2).toLowerCase()
      : "en";
  const supported = SUPPORTED_LANGUAGES.find((l) => l.code === nav);
  return supported ? (supported.code as LanguageCode) : "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: Object.keys(resources.en ?? { common: {} }),
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export function changeLanguage(code: LanguageCode) {
  void i18n.changeLanguage(code);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, code);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = code;
  }
}

export default i18n;
