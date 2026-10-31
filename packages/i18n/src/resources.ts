import commonHi from './locales/hi/common.json';
import navHi from './locales/hi/nav.json';
import authHi from './locales/hi/auth.json';
import notificationsHi from './locales/hi/notifications.json';

import commonEn from './locales/en/common.json';
import navEn from './locales/en/nav.json';
import authEn from './locales/en/auth.json';
import notificationsEn from './locales/en/notifications.json';

export const resources = {
  hi: {
    common: commonHi,
    nav: navHi,
    auth: authHi,
    notifications: notificationsHi,
  },
  en: {
    common: commonEn,
    nav: navEn,
    auth: authEn,
    notifications: notificationsEn,
  },
} as const;
