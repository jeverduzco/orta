import type { AppLanguage } from './appLanguage';

export type TargetLanguageCode =
  | 'es'
  | 'en'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'ca'
  | 'qu'
  | 'ja'
  | 'zh-Hans'
  | 'ko'
  | 'ar';

type LanguageLabels = Record<AppLanguage, string>;

type LanguageEntry = {
  code: TargetLanguageCode;
  /** Native name, used in the model prompt as a stable identifier. */
  nativeName: string;
  /** UI labels per app language. */
  labels: LanguageLabels;
};

export const TARGET_LANGUAGE_REGISTRY: LanguageEntry[] = [
  {
    code: 'es',
    nativeName: 'Español',
    labels: { es: 'Español', en: 'Spanish', pt: 'Espanhol' },
  },
  {
    code: 'en',
    nativeName: 'English',
    labels: { es: 'Inglés', en: 'English', pt: 'Inglês' },
  },
  {
    code: 'fr',
    nativeName: 'Français',
    labels: { es: 'Francés', en: 'French', pt: 'Francês' },
  },
  {
    code: 'de',
    nativeName: 'Deutsch',
    labels: { es: 'Alemán', en: 'German', pt: 'Alemão' },
  },
  {
    code: 'it',
    nativeName: 'Italiano',
    labels: { es: 'Italiano', en: 'Italian', pt: 'Italiano' },
  },
  {
    code: 'pt',
    nativeName: 'Português',
    labels: { es: 'Portugués', en: 'Portuguese', pt: 'Português' },
  },
  {
    code: 'ca',
    nativeName: 'Català',
    labels: { es: 'Catalán', en: 'Catalan', pt: 'Catalão' },
  },
  {
    code: 'qu',
    nativeName: 'Runa Simi',
    labels: { es: 'Quechua', en: 'Quechua', pt: 'Quéchua' },
  },
  {
    code: 'ja',
    nativeName: '日本語',
    labels: { es: 'Japonés', en: 'Japanese', pt: 'Japonês' },
  },
  {
    code: 'zh-Hans',
    nativeName: '简体中文',
    labels: { es: 'Chino simplificado', en: 'Simplified Chinese', pt: 'Chinês simplificado' },
  },
  {
    code: 'ko',
    nativeName: '한국어',
    labels: { es: 'Coreano', en: 'Korean', pt: 'Coreano' },
  },
  {
    code: 'ar',
    nativeName: 'العربية',
    labels: { es: 'Árabe', en: 'Arabic', pt: 'Árabe' },
  },
];

export const DEFAULT_TARGET_LANGUAGE: TargetLanguageCode = 'en';

const LEGACY_LANGUAGE_ALIASES: Record<string, TargetLanguageCode> = {
  Español: 'es',
  Espanol: 'es',
  Inglés: 'en',
  Ingles: 'en',
  Francés: 'fr',
  Frances: 'fr',
  Alemán: 'de',
  Aleman: 'de',
  Italiano: 'it',
  Portugués: 'pt',
  Portugues: 'pt',
  Catalán: 'ca',
  Catalan: 'ca',
  Quechua: 'qu',
  Japonés: 'ja',
  Japones: 'ja',
  'Chino simplificado': 'zh-Hans',
  Coreano: 'ko',
  Árabe: 'ar',
  Arabe: 'ar',
};

const CODE_SET = new Set<string>(TARGET_LANGUAGE_REGISTRY.map((entry) => entry.code));

export const normalizeTargetLanguage = (language: string): TargetLanguageCode => {
  const value = language.trim();

  if (!value) {
    return DEFAULT_TARGET_LANGUAGE;
  }

  if (CODE_SET.has(value)) {
    return value as TargetLanguageCode;
  }

  return LEGACY_LANGUAGE_ALIASES[value] ?? DEFAULT_TARGET_LANGUAGE;
};

export const getTargetLanguageLabel = (code: TargetLanguageCode, appLanguage: AppLanguage): string => {
  const entry = TARGET_LANGUAGE_REGISTRY.find((candidate) => candidate.code === code);
  return entry?.labels[appLanguage] ?? code;
};

export const getTargetLanguageNativeName = (code: TargetLanguageCode): string => {
  const entry = TARGET_LANGUAGE_REGISTRY.find((candidate) => candidate.code === code);
  return entry?.nativeName ?? code;
};
