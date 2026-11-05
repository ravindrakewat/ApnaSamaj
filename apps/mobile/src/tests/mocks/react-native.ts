export const Platform = {
  OS: 'android',
  select: (obj: Record<string, unknown>) => obj.android ?? obj.default,
};

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  hairlineWidth: 1,
};

export const Share = {
  share: async (content: { message: string; title?: string }) => ({ action: 'sharedAction' }),
};

export const Linking = {
  canOpenURL: async (url: string) => true,
  openURL: async (url: string) => true,
};

export const Alert = {
  alert: (title: string, message?: string, buttons?: any[]) => {},
};

export const AppState = {
  currentState: 'active',
  addEventListener: (_event: string, _handler: (status: string) => void) => {
    return { remove: () => {} };
  },
};

export default {
  Platform,
  StyleSheet,
  Share,
  Linking,
  Alert,
  AppState,
};

