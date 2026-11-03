import { resources } from '../../../../packages/i18n/src/resources';
import {
  DEFAULT_LANGUAGE,
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
} from '../../../../packages/i18n/src/constants';

export type TranslationLanguage = SupportedLanguage;

export interface TranslateOptions {
  lang?: TranslationLanguage;
  ns?: string;
  params?: Record<string, string | number>;
  fallback?: string;
}

/**
 * High-performance, lightweight in-memory translation resolver for mobile.
 * Reuses official @apnasamaj/i18n translation resources with zero overhead.
 */
export function resolveTranslation(
  keyPath: string,
  options: TranslateOptions = {}
): string {
  const currentLang = options.lang || DEFAULT_LANGUAGE;
  const fallbackLang: TranslationLanguage = currentLang === 'hi' ? 'en' : 'hi';

  // Parse namespace and key if formatted as "namespace:key" or "key"
  let namespace = options.ns || 'common';
  let key = keyPath;

  if (keyPath.includes(':')) {
    const parts = keyPath.split(':');
    namespace = parts[0];
    key = parts[1];
  }

  // 1. Attempt primary language lookup
  let text = getNestedValue(resources, currentLang, namespace, key);

  // 2. Attempt fallback language lookup if missing
  if (!text) {
    text = getNestedValue(resources, fallbackLang, namespace, key);
  }

  // 3. Fallback to specified fallback string or key itself
  if (!text) {
    text = options.fallback || key;
  }

  // 4. Interpolate {{param}} values if provided
  if (options.params) {
    Object.entries(options.params).forEach(([paramKey, paramVal]) => {
      text = text!.replace(new RegExp(`{{\\s*${paramKey}\\s*}}`, 'g'), String(paramVal));
    });
  }

  return text;
}

function getNestedValue(
  res: typeof resources,
  lang: TranslationLanguage,
  ns: string,
  key: string
): string | null {
  const langResources = res[lang] as Record<string, unknown> | undefined;
  if (!langResources) return null;

  const nsResources = langResources[ns] as Record<string, unknown> | undefined;
  if (!nsResources) return null;

  // Handle dot-notated sub-keys
  const parts = key.split('.');
  let current: unknown = nsResources;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  return typeof current === 'string' ? current : null;
}

export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES };

