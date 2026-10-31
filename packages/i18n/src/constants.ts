export const SUPPORTED_LANGUAGES = ['hi', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'hi';

export const LANGUAGE_STORAGE_KEY = 'apna_samaj_lang';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  hi: 'हिन्दी',
  en: 'English',
};

export const TRANSLATION_NAMESPACES = ['common', 'nav', 'auth', 'notifications'] as const;
export type TranslationNamespace = (typeof TRANSLATION_NAMESPACES)[number];
