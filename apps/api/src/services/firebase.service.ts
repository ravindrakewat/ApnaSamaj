import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/env';

export interface PushNotificationMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SendPushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isInvalidToken?: boolean;
}

export interface MulticastPushResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
  totalTokens: number;
}

let firebaseAppInstance: admin.app.App | null = null;
let isConfigured = false;
let initAttempted = false;
let forceMockForTesting = false;

export function setForceMockForTesting(enable: boolean): void {
  forceMockForTesting = enable;
}

/**
 * Initializes Firebase Admin SDK singleton with service account credentials.
 * Supports:
 *  1. FIREBASE_SERVICE_ACCOUNT_KEY (JSON string or base64 encoded JSON)
 *  2. FIREBASE_SERVICE_ACCOUNT_PATH (path to service account JSON file)
 *  3. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *  4. Application Default Credentials
 *
 * If credentials are not supplied, runs in mock/development mode without crashing the server.
 */
export function initFirebaseAdmin(): admin.app.App | null {
  if (initAttempted) {
    return firebaseAppInstance;
  }
  initAttempted = true;

  try {
    if (admin.apps.length > 0) {
      firebaseAppInstance = admin.apps[0]!;
      isConfigured = true;
      console.info('[Firebase Service] Reusing existing initialized Firebase Admin app.');
      return firebaseAppInstance;
    }

    let credential: admin.credential.Credential | null = null;

    // 1. Service account JSON via environment variable
    if (config.firebaseServiceAccountKey) {
      try {
        let jsonStr = config.firebaseServiceAccountKey.trim();
        if (!jsonStr.startsWith('{')) {
          jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8');
        }
        const parsed = JSON.parse(jsonStr);
        credential = admin.credential.cert(parsed);
      } catch (parseErr) {
        console.warn('[Firebase Service] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:', parseErr);
      }
    }

    // 2. Service account JSON file path
    if (!credential && config.firebaseServiceAccountPath) {
      const resolvedPath = path.resolve(process.cwd(), config.firebaseServiceAccountPath);
      if (fs.existsSync(resolvedPath)) {
        try {
          credential = admin.credential.cert(resolvedPath);
        } catch (pathErr) {
          console.warn('[Firebase Service] Failed to load credentials from file path:', pathErr);
        }
      } else {
        console.warn(`[Firebase Service] Configured credential file not found at: ${resolvedPath}`);
      }
    }

    // 3. Individual parameters
    if (!credential && config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey) {
      try {
        const privateKey = config.firebasePrivateKey.replace(/\\n/g, '\n');
        credential = admin.credential.cert({
          projectId: config.firebaseProjectId,
          clientEmail: config.firebaseClientEmail,
          privateKey,
        });
      } catch (paramErr) {
        console.warn('[Firebase Service] Failed to create credentials from individual env params:', paramErr);
      }
    }

    if (credential) {
      firebaseAppInstance = admin.initializeApp({ credential });
      isConfigured = true;
      console.info('[Firebase Service] Firebase Admin SDK successfully initialized for production FCM push.');
      return firebaseAppInstance;
    }

    // Not configured
    console.info(
      '[Firebase Service] Firebase credentials not configured. FCM push notifications running in mock/development mode.'
    );
    return null;
  } catch (err: unknown) {
    console.warn(
      '[Firebase Service] Failed to initialize Firebase Admin SDK. Fallback to mock mode enabled:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Checks whether live Firebase Admin SDK is configured with valid credentials.
 */
export function isFirebaseConfigured(): boolean {
  if (!initAttempted) {
    initFirebaseAdmin();
  }
  return isConfigured && firebaseAppInstance !== null;
}

/**
 * Detects whether a token is a raw 64-character Apple APNs device token hex string.
 * Standard iOS APNs tokens are 64 hexadecimal characters, whereas FCM registration tokens
 * are 140+ characters containing colons and URL-safe characters.
 */
export function isApnsDeviceToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  return trimmed.length === 64 && /^[0-9a-fA-F]{64}$/.test(trimmed);
}

/**
 * Inspects Firebase error codes to determine if a device token is permanently invalid or unregistered.
 */
export function isPermanentFCMError(error: any): boolean {
  const code = error?.code || error?.errorInfo?.code || '';
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument' ||
    code === 'messaging/mismatched-credential'
  );
}

/**
 * Determines whether an FCM error is transient and safe to retry.
 */
export function isTransientFCMError(error: any): boolean {
  const code = error?.code || error?.errorInfo?.code || '';
  return (
    code === 'messaging/server-unavailable' ||
    code === 'messaging/internal-error' ||
    code === 'messaging/unknown-error' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT'
  );
}

/**
 * Sends an FCM push notification to a single device token.
 * Non-blocking, fault-tolerant, and never throws uncaught exceptions.
 */
export async function sendPushNotificationToToken(
  token: string,
  message: PushNotificationMessage
): Promise<SendPushResult> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return { success: false, error: 'Empty or invalid token supplied.' };
  }

  // Intercept raw APNs tokens to prevent invalid token failures in Firebase Admin SDK
  if (isApnsDeviceToken(token)) {
    console.warn(
      `[Firebase Service] Token "${token.slice(0, 10)}..." is a raw 64-character APNs device token. Firebase Admin SDK requires an FCM registration token. Skipping direct send until converted.`
    );
    return {
      success: false,
      error: 'Raw APNs token supplied. FCM registration token required.',
      isInvalidToken: false,
    };
  }

  const app = initFirebaseAdmin();

  // Mock mode for local dev / tests
  if (!app || !isConfigured || forceMockForTesting) {
    return {
      success: true,
      messageId: `mock-fcm-${crypto.randomUUID()}`,
    };
  }

  const maxAttempts = 2;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const messaging = admin.messaging(app);
      const messageId = await messaging.send({
        token,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: message.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'apna_samaj_default',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });

      return {
        success: true,
        messageId,
      };
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts && isTransientFCMError(err)) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      break;
    }
  }

  const isInvalid = isPermanentFCMError(lastError);
  return {
    success: false,
    error: lastError?.message || 'Unknown FCM delivery error',
    isInvalidToken: isInvalid,
  };
}

/**
 * Sends multicast FCM push notifications to an array of device tokens.
 * Automatically chunks tokens into batches of 500 (FCM limit).
 * Filters out raw unexchanged APNs tokens to protect against invalid-registration-token errors.
 */
export async function sendMulticastPushNotification(
  tokens: string[],
  message: PushNotificationMessage
): Promise<MulticastPushResult> {
  const validTokens = Array.from(new Set(tokens.filter((t) => typeof t === 'string' && t.trim().length > 0)));

  if (validTokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      totalTokens: 0,
    };
  }

  // Partition tokens into genuine FCM tokens vs raw unexchanged APNs tokens
  const fcmTokens: string[] = [];
  const rawApnsTokens: string[] = [];

  for (const t of validTokens) {
    if (isApnsDeviceToken(t)) {
      rawApnsTokens.push(t);
    } else {
      fcmTokens.push(t);
    }
  }

  if (rawApnsTokens.length > 0) {
    console.warn(
      `[Firebase Service] Detected ${rawApnsTokens.length} raw APNs tokens. FCM Admin SDK requires valid FCM registration tokens. These will be skipped until converted to FCM registration tokens.`
    );
  }

  const app = initFirebaseAdmin();

  // Mock mode for local dev / tests
  if (!app || !isConfigured || forceMockForTesting) {
    return {
      successCount: validTokens.length,
      failureCount: 0,
      invalidTokens: [],
      totalTokens: validTokens.length,
    };
  }

  if (fcmTokens.length === 0) {
    return {
      successCount: 0,
      failureCount: rawApnsTokens.length,
      invalidTokens: [],
      totalTokens: validTokens.length,
    };
  }

  const messaging = admin.messaging(app);
  const BATCH_SIZE = 500;
  let totalSuccess = 0;
  let totalFailure = 0;
  const invalidTokens: string[] = [];

  for (let i = 0; i < fcmTokens.length; i += BATCH_SIZE) {
    const chunk = fcmTokens.slice(i, i + BATCH_SIZE);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: message.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'apna_samaj_default',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });

      totalSuccess += response.successCount;
      totalFailure += response.failureCount;

      response.responses.forEach((res, index) => {
        if (!res.success && res.error) {
          if (isPermanentFCMError(res.error)) {
            invalidTokens.push(chunk[index]);
          }
        }
      });
    } catch (batchErr) {
      console.warn('[Firebase Service] Multicast batch failed:', batchErr);
      totalFailure += chunk.length;
    }
  }

  return {
    successCount: totalSuccess,
    failureCount: totalFailure + rawApnsTokens.length,
    invalidTokens,
    totalTokens: validTokens.length,
  };
}

/**
 * Resets Firebase Admin SDK instance (used exclusively for automated unit test resets).
 */
export function resetFirebaseAdminForTesting(): void {
  firebaseAppInstance = null;
  isConfigured = false;
  initAttempted = false;
}

