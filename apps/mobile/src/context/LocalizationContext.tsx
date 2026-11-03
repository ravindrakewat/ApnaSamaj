import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  resolveTranslation,
  TranslationLanguage,
  TranslateOptions,
  DEFAULT_LANGUAGE,
} from '../localization/i18n';
import { getSecureItem, setSecureItem } from '../services/storage.service';
import { STORAGE_KEYS } from '../constants/storageKeys';

interface LocalizationContextType {
  language: TranslationLanguage;
  setLanguage: (lang: TranslationLanguage) => Promise<void>;
  t: (keyPath: string, options?: Omit<TranslateOptions, 'lang'>) => string;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

export const LocalizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<TranslationLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let isMounted = true;
    getSecureItem(STORAGE_KEYS.APP_LANGUAGE).then((savedLang) => {
      if (isMounted && (savedLang === 'hi' || savedLang === 'en')) {
        setLanguageState(savedLang);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (newLang: TranslationLanguage) => {
    setLanguageState(newLang);
    await setSecureItem(STORAGE_KEYS.APP_LANGUAGE, newLang);
  }, []);

  const t = useCallback(
    (keyPath: string, options?: Omit<TranslateOptions, 'lang'>) => {
      return resolveTranslation(keyPath, { ...options, lang: language });
    },
    [language]
  );

  return (
    <LocalizationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LocalizationContext.Provider>
  );
};

export function useLocalization(): LocalizationContextType {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
}

