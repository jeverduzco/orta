export const APP_LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number]['value'];

const isSupportedAppLanguage = (value: string): value is AppLanguage =>
  APP_LANGUAGES.some((option) => option.value === value);

// Detect at module-load time. Works in content scripts, popup, options, and the
// service worker — all expose navigator.language. Falls back to "en" so the
// public release reads English unless the user actually speaks one of the
// supported languages.
const detectDefaultAppLanguage = (): AppLanguage => {
  try {
    const tags = typeof navigator !== 'undefined' && navigator.languages?.length
      ? Array.from(navigator.languages)
      : typeof navigator !== 'undefined' && navigator.language
        ? [navigator.language]
        : [];

    for (const tag of tags) {
      const base = tag.toLowerCase().split('-')[0] ?? '';
      if (isSupportedAppLanguage(base)) {
        return base;
      }
    }
  } catch {
    /* navigator unavailable */
  }
  return 'en';
};

export const DEFAULT_APP_LANGUAGE: AppLanguage = detectDefaultAppLanguage();

export const normalizeAppLanguage = (language: string): AppLanguage =>
  isSupportedAppLanguage(language) ? language : DEFAULT_APP_LANGUAGE;
