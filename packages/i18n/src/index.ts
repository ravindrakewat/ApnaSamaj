export * from './constants.js';
export * from './types.js';
export * from './resources.js';
export * from './i18n.js';

// Re-export core react-i18next hooks and components for consistent application usage
export {
  useTranslation,
  Trans,
  I18nextProvider,
  initReactI18next,
  withTranslation,
} from 'react-i18next';
