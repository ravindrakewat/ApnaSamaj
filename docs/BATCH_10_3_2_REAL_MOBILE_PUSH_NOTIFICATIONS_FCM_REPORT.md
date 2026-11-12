# Batch 10.3.2 — Complete Real Mobile Push Notifications (FCM) Report

**Date:** November 12, 2026  
**Status:** Completed & Verified  
**Branch:** `main`  
**Base Commit:** `26de7a25af628225cc77fa3359c5211553ddb487`  
**Test Verification:**
- **Mobile Push & Navigation Suite (`real-push-notifications.test.ts`):** 14 / 14 Passed (100%)
- **Full Cumulative Mobile Test Suite (`test-runner.ts`):** 528 / 528 Passed across 36 suites (100%)
- **Backend Push Notification Test Suite (`push-notifications.test.ts`):** 51 / 51 Passed (100%)
- **Monorepo Typecheck (`npm run typecheck`):** 0 errors across all 10 workspaces
- **Backend Build (`npm run build:api`):** 0 errors

---

## 1. Existing Implementation Audit & Gap Analysis

### 1.1 What Already Existed Prior to Batch 10.3.2:
- **Prisma Data Layer (`DevicePushToken`, `NotificationPreference`, `NotificationLog`):** Physical tenant database models scoped to community DBs.
- **Backend Services (`apps/api`):**
  - `push-notification.service.ts`: Tenant-scoped device token registry, token upsert, automatic multi-device delivery, invalid token deactivation, and self-action exclusion.
  - `firebase.service.ts`: Firebase Admin SDK initialization supporting production credentials via `FIREBASE_SERVICE_ACCOUNT_KEY` / `FIREBASE_SERVICE_ACCOUNT_PATH` and graceful mock fallback in tests/local development.
  - `notifications.service.ts`: Core in-app notification creator and Socket.IO real-time event dispatcher.
- **Mobile Notification Tokens (`apps/mobile/src/services/notifications/notification-token.service.ts`):**
  - Permission requests via `expo-notifications`.
  - Token retrieval via `Notifications.getDevicePushTokenAsync()`.
  - Registration with backend `/notifications/devices/register`.
  - Logout deactivation via `/notifications/devices/:token`.
- **Mobile Notification Handler (`apps/mobile/src/services/notifications/notification-handler.service.ts`):**
  - Android high-importance channel creation (`apna_samaj_default`).
  - Deep-link route resolver (`resolveNotificationRoute`) for chat, groups, posts, and matrimonial.
- **Mobile Notifications Inbox (`apps/mobile/app/(app)/notifications/index.tsx`):**
  - Centralized in-app notifications inbox with All/Unread tabs, mark-as-read, and badge truncation.

### 1.2 Gaps Identified:
1. **Missing Android 13+ Notification Permission:** `apps/mobile/app.json` lacked `"android.permission.POST_NOTIFICATIONS"`. On Android 13+ (API 33+), push notification permission was not granted by default without this manifest declaration.
2. **Missing Token Rotation / Refresh Listener:** When Firebase or Google Play Services rotated the native device FCM token while the app was running or after an OS update, the mobile client did not listen to `Notifications.addPushTokenListener` to re-register the fresh token with the backend.
3. **No Active Screen Awareness in Foreground Notifications (Disruptive Alerts):** In-app foreground alert banners would pop up over active conversations even when the user was actively typing and chatting in that exact room, violating WhatsApp/Facebook design conventions.
4. **Terminated / Cold-Start Tap Race Condition:** When a user tapped a notification while the mobile app was terminated or cold-starting, the route would be lost if navigation mounted before authentication resolved.
5. **Session Cache Duplication Prevention:** Consecutive renders or screen re-mounts repeatedly invoked backend token registration if in-memory caching was absent.

---

## 2. Files Created and Modified

### 2.1 Modified Files:
1. `apps/mobile/app.json`:
   - Added `"android.permission.POST_NOTIFICATIONS"` to `expo.android.permissions`.
2. `apps/mobile/src/services/notifications/notification-token.service.ts`:
   - Added `setupPushTokenRefreshListener()` subscribing to `Notifications.addPushTokenListener` for dynamic OS token rotation.
   - Added `getSessionRegisteredToken()` and `clearSessionRegisteredTokenForTesting()` for in-memory session caching and deduplication.
3. `apps/mobile/src/services/notifications/notification-handler.service.ts`:
   - Added `ActiveChatContext`, `setActiveChatContext()`, and `getActiveChatContext()`.
   - Added `shouldPresentForegroundNotification()` suppressing alert banners when viewing the same direct conversation or community group chat.
   - Added `setPendingNotificationRoute()`, `getPendingNotificationRoute()`, and `consumePendingNotificationRoute()` for resilient cold-start and deferred navigation.
   - Updated `Notifications.setNotificationHandler()` to consult active context.
4. `apps/mobile/app/_layout.tsx`:
   - Added active chat context tracking in `NavigationGate`.
   - Added `consumePendingNotificationRoute()` in `NavigationGate` to immediately route to cold-start target once authenticated.
   - Registered `setupPushTokenRefreshListener()` with automatic cleanup on unmount.
5. `apps/mobile/app/(app)/chat/[id].tsx`:
   - Added active conversation context tracking via `setActiveChatContext({ conversationId })` on mount and clear on unmount.
6. `apps/mobile/app/(app)/group/[slug]/chat.tsx`:
   - Added active group chat context tracking via `setActiveChatContext({ groupId: group?.id || slug })` on mount and clear on unmount.
7. `apps/mobile/src/tests/mocks/expo-notifications.ts`:
   - Added `addPushTokenListener` and test helper `__triggerPushTokenRefresh`.
8. `apps/mobile/src/tests/test-runner.ts`:
   - Registered `runRealPushNotificationsTests()` into the automated test suite runner.

### 2.2 Created Files:
1. `apps/mobile/src/tests/real-push-notifications.test.ts`:
   - 14 comprehensive automated unit and integration tests verifying registration, token rotation, multiple devices, logout cleanup, permission states, preferences, Android channels, active screen suppression, background delivery, cold starts, deep links, multi-tenancy, deduplication, and inbox regression.
2. `docs/BATCH_10_3_2_REAL_MOBILE_PUSH_NOTIFICATIONS_FCM_REPORT.md`:
   - This architectural audit and verification report.

---

## 3. Packages and Compatibility

- **Existing Packages Kept:**
  - `expo-notifications`: `~0.29.13` (compatible with Expo SDK 52)
  - `firebase-admin`: `^12.6.0` (Backend `apps/api`)
- **Compatibility Rationale:**
  - `expo-notifications` v0.29 is the standard native notification package for Expo SDK 52 and Hermes runtime.
  - Avoided introducing `@react-native-firebase/app` or native iOS pods that would break EAS Cloud build configurations until APNs p8 certificates are provisioned by the team.

---

## 4. Backend FCM Implementation Details

- **Initialization:**
  - Configured in `apps/api/src/modules/notifications/firebase.service.ts`.
  - Initialized with Google Service Account credentials via `FIREBASE_SERVICE_ACCOUNT_KEY` JSON or `FIREBASE_SERVICE_ACCOUNT_PATH`.
  - Gracefully falls back to mock mode during automated testing and local developer environments without throwing unhandled exceptions.
- **Dispatch Flow:**
  - Triggers on direct messages, group messages, matrimonial interest, comments, post likes, and announcements.
  - Automatically filters out the sender (`actorId === recipientId`).
  - Checks recipient's `NotificationPreference` (e.g. `matrimonial`, `personalMessages`, `likes`, `comments`).
  - Automatically queries all active tokens for the user in `req.db` (`DevicePushToken`).
  - Sends high-priority FCM payload with channel ID `apna_samaj_default`.
  - Catches invalid token errors (`messaging/registration-token-not-registered`, `messaging/invalid-registration-token`) and automatically deactivates stale tokens (`isActive: false`).

---

## 5. Android Configuration Requirements

1. **Manifest Permissions:**
   - `"android.permission.POST_NOTIFICATIONS"` declared in `app.json`.
   - Native prompt displayed at runtime via `requestNotificationPermissions()`.
2. **Notification Channel:**
   - Channel ID: `apna_samaj_default`
   - Name: `General Notifications`
   - Importance: `Notifications.AndroidImportance.MAX` (High priority, pops on screen)
   - Vibration pattern: `[0, 250, 250, 250]`
   - Light color: `#0284c7`
   - Sound: `'default'`
3. **Google Services File:**
   - For standalone APK/AAB distribution, `google-services.json` must be placed in `apps/mobile/` and referenced in `app.json` under `expo.android.googleServicesFile`.

---

## 6. iOS Configuration Requirements

1. **APNs / FCM Token Conversion:**
   - When running on iOS, `Notifications.getDevicePushTokenAsync()` returns a 64-character raw APNs token unless configured with Firebase Cloud Messaging.
   - The backend service safely detects raw 64-char APNs tokens and registers them with `isActive: false` to prevent FCM delivery crashes until an APNs auth key (`.p8`) or Firebase iOS configuration is registered in Firebase Console.
2. **EAS Build Credentials Required for iOS:**
   - Apple Developer Team ID
   - APNs Authentication Key (`.p8` file), Key ID, and Team ID uploaded to Expo Application Services (EAS).

---

## 7. Multi-Tenant Security Invariants Preserved

- **Header Scoping:** `x-community-slug` is attached to all push token registration, preference update, and notification queries.
- **Tenant Database Scoping:** All tokens are stored in the community's physical database (`req.db`). A user in Community A cannot receive or query push tokens from Community B.
- **Zero Secret Exposure:** Firebase service account credentials remain exclusively on the Node.js backend. Mobile app receives only minimal routing identifiers (`type`, `conversationId`, `postId`, `groupId`). No password hashes, auth tokens, or private phone numbers are embedded in push payloads.

---

## 8. Verification Results

### 8.1 Batch 10.3.2 Real Push Notifications Test Suite
```text
================================================================
  Apna Samaj — Batch 10.3.2: Real Mobile Push Notifications Tests
================================================================
✅ PASS: 1. Device token registration & session caching prevents redundant calls
[Notification Service] Push token refreshed by OS/FCM. Re-registering with backend...
✅ PASS: 2. Token refresh listener detects OS/FCM rotation and re-registers
✅ PASS: 3. Multiple devices per user support (phone & tablet tokens)
✅ PASS: 4. Invalid/expired token cleanup deactivates token & purges storage
✅ PASS: 5. Android 13+ POST_NOTIFICATIONS permission states (granted/denied)
✅ PASS: 6. User notification preferences (fetch & toggle update)
✅ PASS: 7. Android notification channels configuration and FCM data payload
✅ PASS: 8. Foreground presentation suppresses alert when user is actively in conversation
✅ PASS: 9. Background notification delivery contract verification
✅ PASS: 10. Terminated-app cold start & pending route consumption
✅ PASS: 11. Comprehensive deep-link routing for all notification types
✅ PASS: 12. Multi-tenant isolation during push token registration
✅ PASS: 13. Duplicate notification registration prevention across re-renders
✅ PASS: 14. Notification inbox regression verification (fetch, unread count, mark read)

================================================================
🎉 REAL PUSH NOTIFICATIONS TEST SUMMARY: 14 passed, 0 failed.
================================================================
```

### 8.2 Monorepo Verification
- **Mobile Test Suite:** 528 / 528 Passed across 36 test suites (100%)
- **Backend Push Test Suite:** 51 / 51 Passed (100%)
- **Monorepo Typecheck:** 0 errors across all 10 workspaces
- **API Production Build:** 0 errors

---

## 9. Manual Android Physical Device Testing Instructions

To test real push notifications on a physical Android handset:

1. **Obtain Google Services Configuration:**
   - Download `google-services.json` from the Firebase Console project (`Apna Samaj`).
   - Place `google-services.json` in `apps/mobile/google-services.json`.
2. **Build Preview APK via EAS:**
   - In terminal with interactive TTY:
     ```bash
     cd apps/mobile
     npx eas-cli build --platform android --profile preview
     ```
3. **Install APK on Physical Device:**
   - Download the generated `.apk` and install on an Android 13+ device.
4. **Login & Grant Permission:**
   - Open Apna Samaj app, log in, and grant notification permission when prompted.
5. **Send Test Direct / Group Message:**
   - Using a second phone or web portal, send a direct message to the logged-in user.
   - **Case A (Foreground):** Notification banner is displayed if not on the chat screen; suppressed cleanly if viewing the same chat.
   - **Case B (Background):** Minimize the app; notification arrives in the Android notification tray with sound and vibration.
   - **Case C (Terminated / Locked):** Swipe close the app and lock the screen; notification appears on the lock screen.
   - **Case D (Deep Link Tap):** Tapping the notification immediately launches the app and navigates to `/(app)/chat/[id]`.

---

## 10. Remaining Blockers & Credentials for Production Distribution

1. **Firebase Production Service Account:**
   - Needs to be set on Render hosting environment variables as `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string) or path to secret file.
2. **`google-services.json` for Android:**
   - Required for standalone native Android builds to connect to Firebase.
3. **Apple APNs p8 Key:**
   - Required for production iOS push notifications.

---

## 11. Git Working Tree Status

- **Current HEAD:** `26de7a25af628225cc77fa3359c5211553ddb487`
- **Modified Files (Staged for Review):**
  - `apps/mobile/app.json`
  - `apps/mobile/app/(app)/chat/[id].tsx`
  - `apps/mobile/app/(app)/group/[slug]/chat.tsx`
  - `apps/mobile/app/_layout.tsx`
  - `apps/mobile/src/services/notifications/notification-handler.service.ts`
  - `apps/mobile/src/services/notifications/notification-token.service.ts`
  - `apps/mobile/src/tests/mocks/expo-notifications.ts`
  - `apps/mobile/src/tests/test-runner.ts`
- **Untracked Test & Documentation Files:**
  - `apps/mobile/src/tests/real-push-notifications.test.ts`
  - `docs/BATCH_10_3_2_REAL_MOBILE_PUSH_NOTIFICATIONS_FCM_REPORT.md`
- **Zero Git mutations executed:** No `git add`, `git commit`, or `git push` performed, strictly respecting safety protocol.

