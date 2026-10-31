import i18next, { i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
} from './constants.js';
import { resources } from './resources.js';

export function isSupportedLanguage(lang: unknown): lang is SupportedLanguage {
  return typeof lang === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

export function parseLanguageCode(langStr: string | null | undefined): SupportedLanguage | null {
  if (!langStr) return null;
  const clean = langStr.trim().toLowerCase();
  if (clean === 'hi' || clean.startsWith('hi-')) return 'hi';
  if (clean === 'en' || clean.startsWith('en-')) return 'en';
  return null;
}

export function getSavedLanguage(): SupportedLanguage | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return parseLanguageCode(saved);
  } catch {
    return null;
  }
}

export function detectBrowserLanguage(): SupportedLanguage | null {
  if (typeof window === 'undefined' || !window.navigator) {
    return null;
  }
  try {
    const languages = window.navigator.languages || [window.navigator.language];
    for (const lang of languages) {
      const parsed = parseLanguageCode(lang);
      if (parsed) return parsed;
    }
  } catch {
    // Graceful fallback on restricted environments
  }
  return null;
}

export function detectInitialLanguage(): SupportedLanguage {
  // 1. Explicitly saved user language preference
  const saved = getSavedLanguage();
  if (saved) return saved;

  // 2. Supported browser language
  const browserLang = detectBrowserLanguage();
  if (browserLang) return browserLang;

  // 3. Fallback for unsupported or missing languages
  return DEFAULT_LANGUAGE;
}

export const i18n: I18nInstance = i18next.createInstance();

const initialLanguage = detectInitialLanguage();

// Configure the detector
const detector = new LanguageDetector();
detector.addDetector({
  name: 'customOrderDetector',
  lookup: () => detectInitialLanguage(),
  cacheUserLanguage: (lng: string) => {
    if (typeof window !== 'undefined' && window.localStorage && isSupportedLanguage(lng)) {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
      } catch {
        // Ignore storage write errors (e.g. private mode quota)
      }
    }
  },
});

if (!i18n.isInitialized) {
  i18n
    .use(detector)
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLanguage,
      fallbackLng: DEFAULT_LANGUAGE,
      defaultNS: 'common',
      fallbackNS: 'common',
      supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
      interpolation: {
        escapeValue: false, // React already escapes values safely
      },
      detection: {
        order: ['customOrderDetector'],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        caches: ['localStorage'],
      },
      react: {
        useSuspense: false,
      },
    });

  // Sync HTML lang attribute when in browser
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = i18n.language || initialLanguage;
  }

  // Update localStorage and document.documentElement.lang on language change
  i18n.on('languageChanged', (lng: string) => {
    const supported = isSupportedLanguage(lng) ? lng : parseLanguageCode(lng) || DEFAULT_LANGUAGE;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, supported);
      } catch {
        // Ignore storage errors
      }
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = supported;
    }
  });
}

export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  if (!isSupportedLanguage(lang)) {
    throw new Error(`Unsupported language: "${lang}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
  }

  await i18n.changeLanguage(lang);
}

export function getCurrentLanguage(): SupportedLanguage {
  const current = i18n.language;
  return isSupportedLanguage(current) ? current : parseLanguageCode(current) || DEFAULT_LANGUAGE;
}
