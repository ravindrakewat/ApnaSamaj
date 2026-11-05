let mockToken = 'mock-fcm-native-token-abc123xyz';
let mockTokenType = 'fcm';
let mockPermissionStatus = 'granted';
let lastResponse: any = null;

export const AndroidImportance = {
  MAX: 5,
  HIGH: 4,
  DEFAULT: 3,
  LOW: 2,
  MIN: 1,
  NONE: 0,
};

export const setNotificationHandler = (handler: any) => {};

export const getPermissionsAsync = async () => ({
  status: mockPermissionStatus,
  granted: mockPermissionStatus === 'granted',
  canAskAgain: true,
  expires: 'never',
});

export const requestPermissionsAsync = async () => ({
  status: mockPermissionStatus,
  granted: mockPermissionStatus === 'granted',
  canAskAgain: true,
  expires: 'never',
});

export const getDevicePushTokenAsync = async () => ({
  type: mockTokenType,
  data: mockToken,
});

export const setNotificationChannelAsync = async (channelId: string, channelConfig: any) => {};

export const addNotificationReceivedListener = (callback: any) => ({
  remove: () => {},
});

export const addNotificationResponseReceivedListener = (callback: any) => ({
  remove: () => {},
});

export const getLastNotificationResponseAsync = async () => lastResponse;

// Helpers for unit test manipulation
export const __setMockPushToken = (token: string) => {
  mockToken = token;
};

export const __setMockDeviceTokenType = (type: string) => {
  mockTokenType = type;
};

export const __setMockPermissionStatus = (status: string) => {
  mockPermissionStatus = status;
};

export const __setMockLastResponse = (response: any) => {
  lastResponse = response;
};

