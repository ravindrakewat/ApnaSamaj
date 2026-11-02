import { SupportedLanguage, TranslationNamespace } from './constants.js';
import commonHi from './locales/hi/common.json';
import navHi from './locales/hi/nav.json';
import authHi from './locales/hi/auth.json';
import notificationsHi from './locales/hi/notifications.json';
import feedHi from './locales/hi/feed.json';
import directoryHi from './locales/hi/directory.json';
import groupsHi from './locales/hi/groups.json';
import matrimonialHi from './locales/hi/matrimonial.json';

export type { SupportedLanguage, TranslationNamespace };

export interface TranslationSchema {
  common: typeof commonHi;
  nav: typeof navHi;
  auth: typeof authHi;
  notifications: typeof notificationsHi;
  feed: typeof feedHi;
  directory: typeof directoryHi;
  groups: typeof groupsHi;
  matrimonial: typeof matrimonialHi;
}

export type CommonTranslationKey = keyof typeof commonHi;
export type NavTranslationKey = keyof typeof navHi;
export type AuthTranslationKey = keyof typeof authHi;
export type NotificationsTranslationKey = keyof typeof notificationsHi;
export type FeedTranslationKey = keyof typeof feedHi;
export type DirectoryTranslationKey = keyof typeof directoryHi;
export type GroupsTranslationKey = keyof typeof groupsHi;
export type MatrimonialTranslationKey = keyof typeof matrimonialHi;
