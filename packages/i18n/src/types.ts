import { SupportedLanguage, TranslationNamespace } from './constants.js';
import commonHi from './locales/hi/common.json';
import navHi from './locales/hi/nav.json';
import authHi from './locales/hi/auth.json';
import notificationsHi from './locales/hi/notifications.json';

export type { SupportedLanguage, TranslationNamespace };

export interface TranslationSchema {
  common: typeof commonHi;
  nav: typeof navHi;
  auth: typeof authHi;
  notifications: typeof notificationsHi;
}

export type CommonTranslationKey = keyof typeof commonHi;
export type NavTranslationKey = keyof typeof navHi;
export type AuthTranslationKey = keyof typeof authHi;
export type NotificationsTranslationKey = keyof typeof notificationsHi;
