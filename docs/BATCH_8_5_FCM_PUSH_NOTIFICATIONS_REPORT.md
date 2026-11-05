# Apna Samaj — Batch 8.5: Firebase Cloud Messaging (FCM) Push Notifications Implementation & Verification Report

**Date:** November 5, 2026  
**Status:** Implemented & Verified (Working Tree Ready for Review)  
**Track:** Mobile & Backend Push Notification Infrastructure  
**Workspaces Involved:** `apps/api`, `apps/mobile`, `packages/database`, `packages/shared-types`, `packages/validation`

---

## 1. Executive Summary & Goals

Batch 8.5 delivers a production-grade, privacy-first **Push Notification System** powered directly by **Firebase Cloud Messaging (FCM)** via the `firebase-admin` SDK from the Node.js backend to Android and iOS mobile devices (`expo-notifications`).

### Architectural Distinctions:
1. **Direct FCM vs Expo Push Service:**
   - Push notifications are delivered directly from our Node.js backend using Google's `firebase-admin` SDK.
   - Devices register native FCM registration tokens on Android (`Notifications.getDevicePushTokenAsync()`) and APNs tokens on iOS.
   - We do not use the third-party Expo Push Service as the primary transport mechanism.
2. **Clear Boundaries:**
   - **FCM** handles alerts for when the mobile app is in the background, closed, or the device screen is locked.
   - **Socket.IO** remains the real-time transport for active in-app state updates, immediate chat bubble delivery, typing indicators, and real-time read receipts.
3. **Multi-Tenant Database Scoping:**
   - Tokens and preferences reside inside each community tenant database (`req.db`), fully maintaining physical tenant isolation.
   - Operations in Community Alpha cannot see, mutate, or trigger notifications to devices registered in Community Beta.
4. **Privacy Invariant:**
   - Push notifications never carry raw confidential message text, passwords, phone numbers, or unredacted matrimonial profile details.
   - Payloads contain only generalized descriptions (e.g., *"Sent a photo"*, *"Rahul Sharma commented on your post"*) and minimal routing metadata (`conversationId`, `groupId`, `postId`).
   - Destination screens perform full authorization checks upon navigation.

---

## 2. Database Schema & Migration SQL Artifact

### Prisma Schema Updates (`packages/database/prisma/schema.prisma`)
Added three models and two enums:

```prisma
enum DevicePlatform {
  ANDROID
  IOS
}

enum NotificationDeliveryStatus {
  PENDING
  DELIVERED
  FAILED
}

model DevicePushToken {
  id         String         @id @default(uuid())
  userId     String
  deviceId   String?
  token      String         @unique
  platform   DevicePlatform
  isActive   Boolean        @default(true)
  lastUsedAt DateTime       @default(now())
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
  @@index([isActive])
}

model NotificationPreference {
  id               String   @id @default(uuid())
  userId           String   @unique
  personalMessages Boolean  @default(true)
  groupMessages    Boolean  @default(true)
  matrimonial      Boolean  @default(true)
  likes            Boolean  @default(true)
  comments         Boolean  @default(true)
  announcements    Boolean  @default(true)
  communityUpdates Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model NotificationLog {
  id        String                     @id @default(uuid())
  userId    String
  category  String
  status    NotificationDeliveryStatus @default(PENDING)
  errorCode String?
  createdAt DateTime                   @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([createdAt])
}
```

Updated the existing `User` model with relation fields:
```prisma
devicePushTokens       DevicePushToken[]
notificationPreference NotificationPreference?
notificationLogs       NotificationLog[]
```

### Migration SQL Artifact
In strict compliance with repository safety rules, database migrations were not run against physical databases. The migration SQL was generated as an artifact at:
`packages/database/prisma/migrations/20261105170000_add_device_push_tokens_and_preferences/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "DevicePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personalMessages" BOOLEAN NOT NULL DEFAULT true,
    "groupMessages" BOOLEAN NOT NULL DEFAULT true,
    "matrimonial" BOOLEAN NOT NULL DEFAULT true,
    "likes" BOOLEAN NOT NULL DEFAULT true,
    "comments" BOOLEAN NOT NULL DEFAULT true,
    "announcements" BOOLEAN NOT NULL DEFAULT true,
    "communityUpdates" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX "DevicePushToken_userId_idx" ON "DevicePushToken"("userId");
CREATE INDEX "DevicePushToken_token_idx" ON "DevicePushToken"("token");
CREATE INDEX "DevicePushToken_isActive_idx" ON "DevicePushToken"("isActive");
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");
CREATE INDEX "NotificationLog_userId_idx" ON "NotificationLog"("userId");
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## 3. Backend APIs & Endpoint Contracts

All push notification routes are mounted under `/api/v1/notifications` in `apps/api/src/modules/notifications/notifications.routes.ts`:

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/notifications/devices/register` | Required | Registers or updates device token for user. Prevents duplicates. |
| `DELETE` | `/api/v1/notifications/devices/:id` | Required | Deactivates token by UUID or token string upon logout. |
| `GET` | `/api/v1/notifications/preferences` | Required | Returns user's notification preferences with secure default fallbacks. |
| `PATCH` | `/api/v1/notifications/preferences` | Required | Updates user's notification preferences. |

### Request & Response Payloads

#### 1. Register Device Token (`POST /devices/register`)
- **Request Body:**
  ```json
  {
    "token": "dGhpcy1pcy1hLXJlYWwtZmNtLXRva2Vu...",
    "platform": "ANDROID",
    "deviceId": "samsung-sm-g998b"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "data": {
      "id": "e30e1591-628d-4f18-bb9f-81816e87796d",
      "platform": "ANDROID",
      "isActive": true,
      "createdAt": "2026-11-05T16:20:00.000Z"
    }
  }
  ```
  *(Note: The full FCM token string is omitted from the response for security).*

#### 2. Deactivate Device Token (`DELETE /devices/:id`)
- **Request Param:** `:id` can be either the database UUID or the raw FCM registration token string.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Device token deactivated successfully."
  }
  ```

#### 3. Get / Patch Preferences (`GET / PATCH /preferences`)
- **Patch Request Body:**
  ```json
  {
    "personalMessages": true,
    "groupMessages": false,
    "likes": false
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "personalMessages": true,
      "groupMessages": false,
      "matrimonial": true,
      "likes": false,
      "comments": true,
      "announcements": true,
      "communityUpdates": true
    }
  }
  ```

---

## 4. Push Notification Service & Privacy Guarantees

Implemented in `apps/api/src/modules/notifications/push-notification.service.ts` and `apps/api/src/services/firebase.service.ts`:

1. **Non-Blocking Fault Tolerance:**
   - Any failure during push notification delivery (e.g. Firebase API downtime, invalid token, network timeout) is safely logged as a warning and **never** breaks caller transactions or chat message persistence.
2. **Automatic Token Invalidation & Pruning:**
   - The service inspects FCM multicast delivery response codes.
   - Permanently invalid tokens (`messaging/registration-token-not-registered`, `messaging/invalid-registration-token`, etc.) are automatically marked `isActive = false` in the database.
3. **Actor Self-Action Exclusion:**
   - The sender of a message, author of a comment, or member giving a like is automatically filtered out from recipient lists.
4. **Preference Checks:**
   - Before querying device tokens, recipient preference toggles are checked. If disabled, dispatch is cleanly skipped with reason `CATEGORY_DISABLED_BY_USER`.
5. **Multi-device Support:**
   - If a member is logged in across phone and tablet, notifications multicast to all active tokens of that user in parallel batches.
6. **Graceful Mock Fallback:**
   - If `FIREBASE_SERVICE_ACCOUNT_KEY` is not present in `.env`, the service automatically activates mock mode, simulating delivery IDs and allowing local development and automated test suites to run with zero crashes.

---

## 5. Event Triggers & Integration Points

Integrated across the backend modules:

1. **Personal One-to-One Chat (`apps/api/src/modules/chat/direct-chat.service.ts`):**
   - In `sendDirectMessage`: Dispatches push to the other participant.
   - Body format: Sender Name + *"Sent you a message"*, *"Sent a photo"*, *"Sent a video"*, or *"Sent a document"*.
   - Data payload: `{ type: "PERSONAL_CHAT", conversationId: "<id>", entityId: "<messageId>" }`.
2. **Community Group Chat (`apps/api/src/modules/chat/chat.service.ts`):**
   - In `sendChatMessage`: Multicasts push to all active group members, excluding the sender.
   - Title: Group Name. Body: `<Sender Name>: Sent a message` (or media indicator).
   - Data payload: `{ type: "GROUP_CHAT", groupId: "<id>", groupSlug: "<slug>", entityId: "<messageId>" }`.
3. **Social Feed Engagement (`apps/api/src/modules/notifications/notifications.service.ts`):**
   - In `sendNotificationSafely`:
     - `POST_LIKE`: Title: *"New Like"*, Body: `"<Actor> liked your post."`. Suppressed if like occurs within 24h of an existing unread like from the same actor.
     - `POST_COMMENT`: Title: *"New Comment"*, Body: `"<Actor> commented on your post."`.
     - Data payload: `{ type: "POST_LIKE" | "POST_COMMENT", postId: "<id>" }`.
4. **Matrimonial Interests (`apps/api/src/modules/notifications/notifications.service.ts`):**
   - For `MATRIMONIAL_INTEREST_RECEIVED` & status changes.
   - Data payload: `{ type: "MATRIMONIAL_INTEREST", interestId: "<id>" }`.
5. **Community Announcements:**
   - For general community broadcasts.
   - Data payload: `{ type: "ANNOUNCEMENT", postId: "<id>" }`.

---

## 6. Mobile Client Implementation (`apps/mobile`)

Integrated cleanly with Expo SDK 52, Expo Router v4, and React Native:

### Dependencies Installed:
- `expo-notifications@^0.29.14`
- Plugin registered in `app.json`:
  ```json
  "plugins": [
    "expo-router",
    "expo-secure-store",
    "expo-notifications"
  ]
  ```

### Mobile Services Created:
1. `apps/mobile/src/services/notifications/notification-token.service.ts`:
   - `requestNotificationPermissions()`: Prompts for notification permissions (including Android 13+ `POST_NOTIFICATIONS`).
   - `getDevicePushToken()`: Invokes native `Notifications.getDevicePushTokenAsync()`.
   - `registerPushTokenWithBackend()`: Registers with `/notifications/devices/register` and saves token to SecureStore under `apna_samaj_registered_push_token`.
   - `unregisterPushTokenOnLogout()`: Invokes `/notifications/devices/:id` and clears SecureStore.
2. `apps/mobile/src/services/notifications/notification-handler.service.ts`:
   - Configures foreground notification handler (`shouldShowAlert: true`, `shouldPlaySound: true`, `shouldSetBadge: true`).
   - `setupAndroidNotificationChannels()`: Creates Android notification channel `apna_samaj_default` (MAX importance, blue badge, default sound).
   - `resolveNotificationRoute(data)`: Maps FCM data payload to Expo Router navigation routes:
     - `PERSONAL_CHAT` -> `/(app)/chat/[id]`
     - `GROUP_CHAT` -> `/(app)/group/[slug]/chat`
     - `MATRIMONIAL_INTEREST` -> `/(app)/matrimonial`
     - `POST_COMMENT` / `POST_LIKE` -> `/(app)/post/[id]`
     - `ANNOUNCEMENT` -> `/(app)/post/[id]`
   - `setupNotificationListeners(config)`: Attaches foreground and tap listeners.
   - `checkColdStartNotification(onNavigate)`: Detects if the app was launched by tapping a push notification from a cold/killed state (`Notifications.getLastNotificationResponseAsync()`).

### App Lifecycle Wiring:
- In `apps/mobile/app/_layout.tsx` (`NavigationGate`):
  - On authenticated mount, initializes Android channels, registers push token with backend, attaches listeners, and checks for cold-start tap navigation.
  - Cleans up subscriptions on unmount.
- In `apps/mobile/src/context/AuthContext.tsx`:
  - `logout()`: Calls `unregisterPushTokenOnLogout()`.
  - `switchCommunity()`: Calls `unregisterPushTokenOnLogout()` before tenant switch to prevent cross-tenant notification bleed.

### Settings UI:
- In `apps/mobile/app/(app)/profile/settings.tsx`:
  - Added dedicated **"सूचना प्राथमिकताएं (Notification Preferences)"** section.
  - Allows members to toggle:
    - Personal Messages (`personalMessages`)
    - Group Messages (`groupMessages`)
    - Matrimonial Alerts (`matrimonial`)
    - Likes & Comments (`likes`, `comments`)
    - Announcements & Updates (`announcements`, `communityUpdates`)
  - Loads settings from `/preferences` and persists updates via `PATCH /preferences`.

---

## 7. Verification & Test Execution Results

### 1. Backend Test Suite (`apps/api/src/tests/push-notifications.test.ts`)
Executed via `npx tsx apps/api/src/tests/push-notifications.test.ts`:
- **Scenarios Verified:**
  1. Device Token Registration (`registerDevicePushToken`).
  2. Duplicate Token Registration / Atomic Re-assignment (Device transfer from User A to User B).
  3. Multiple Active Devices Per User.
  4. Token Refresh on Same Device.
  5. Device Deactivation on Logout (`deactivateDevicePushToken` & `deactivateAllUserTokens`).
  6. Multi-Tenant Database Isolation (Community Alpha vs Community Beta token partitioning).
  7. User Notification Preferences (defaults & toggle updates).
  8. Personal Chat Notification Trigger & Privacy Payload verification.
  9. Group Chat Notification Trigger & Multicast delivery.
  10. Matrimonial Notification Trigger & Preference disablement check.
  11. Social Feed Notification Trigger (likes, comments).
  12. Sender Self-Action Exclusion (actorId suppression).
  13. Invalid FCM Token Identification (`isPermanentFCMError`) & Automatic DB Cleanup.
  14. Firebase Mock Mode Resilience without cloud credentials.
  15. Notification Failure Does Not Break Primary Message Persistence (fault containment).
  16. Duplicate Notification Prevention (24-hour like deduplication).
  17. Privacy Payload Verification (no message content, passwords, or phone numbers in push payload).
- **Result:** **43 passed, 0 failed.**

### 2. Backend Regression Suites
- `npx tsx apps/api/src/tests/direct-messaging-flow.test.ts`: **41 passed, 0 failed.**
- `npx tsx apps/api/src/tests/chat-media-attachments.test.ts`: **29 passed, 0 failed.**

### 3. Mobile Test Suite (`apps/mobile/src/tests/test-runner.ts`)
Executed via `npm test --workspace=@apnasamaj/mobile`:
- **Push Notification Scenarios Verified:**
  1. Permission handling and request (granted vs denied).
  2. Native device push token acquisition & backend registration.
  3. Token refresh updates SecureStore record.
  4. Notification listeners initialize and return cleanup teardown.
  5. Notification tap routing resolution for all notification categories.
  6. Logout cleanup deactivates token and purges SecureStore.
  7. Community switching triggers clean push token teardown.
  8. Notification preferences API (fetch & toggle update).
  9. Cold-start tap detection resolves destination route on bootstrap.
  10. Graceful fallback on Web platform without errors.
- **Result:** **10 passed, 0 failed** (All 15 mobile test suites in the monorepo passed).

### 4. Monorepo-Wide Typecheck (`npm run typecheck`)
Executed across all 9 workspaces:
- `@apnasamaj/admin`: **0 errors**
- `@apnasamaj/api`: **0 errors**
- `@apnasamaj/mobile`: **0 errors**
- `@apnasamaj/web`: **0 errors**
- `@apnasamaj/database`: **0 errors**
- `@apnasamaj/i18n`: **0 errors**
- `@apnasamaj/shared-types`: **0 errors**
- `@apnasamaj/ui-config`: **0 errors**
- `@apnasamaj/validation`: **0 errors**
- **Result:** **Exit code 0.**

### 5. Metro Web Export Verification
Executed via `npx expo export --platform web`:
- Bundled 907 modules in 7.8s without errors.
- Exported static web distribution bundle (`dist/`).
- **Result:** **Exit code 0.**

---

## 8. Physical Device Testing & Firebase Setup Guide

To test real physical push notifications in production or on physical Android / iOS devices:

### Step 1: Firebase Console Setup
1. Create or open your Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Add an **Android app** with package name `com.apnasamaj.app`.
3. Download `google-services.json` and place it in `apps/mobile/google-services.json`.
4. (For iOS) Add an **iOS app** with bundle identifier `com.apnasamaj.app`, download `GoogleService-Info.plist` and place it in `apps/mobile/GoogleService-Info.plist`.
5. In `apps/mobile/app.json`, add:
   ```json
   "android": {
     "package": "com.apnasamaj.app",
     "googleServicesFile": "./google-services.json"
   },
   "ios": {
     "bundleIdentifier": "com.apnasamaj.app",
     "googleServicesFile": "./GoogleService-Info.plist"
   }
   ```

### Step 2: Backend Service Account Configuration
1. In Firebase Console, go to **Project Settings** → **Service Accounts** → **Generate new private key**.
2. Set the configuration in `apps/api/.env` using any of these supported methods:
   - **Method A (File Path):**
     ```env
     FIREBASE_SERVICE_ACCOUNT_PATH="./firebase-service-account.json"
     ```
   - **Method B (JSON String or Base64):**
     ```env
     FIREBASE_SERVICE_ACCOUNT_KEY="{\"type\":\"service_account\",\"project_id\":\"...\"}"
     ```
   - **Method C (Individual Parameters):**
     ```env
     FIREBASE_PROJECT_ID="apna-samaj-prod"
     FIREBASE_CLIENT_EMAIL="firebase-adminsdk@apna-samaj-prod.iam.gserviceaccount.com"
     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
     ```

### Step 3: Native Build Generation (EAS Build / Local Prebuild)
Since native FCM requires compiled Android/iOS push libraries rather than standard Expo Go:
- **Local Prebuild & Run:**
  ```bash
  cd apps/mobile
  npx expo prebuild
  npx expo run:android
  ```
- **Or EAS Cloud Build:**
  ```bash
  cd apps/mobile
  eas build --profile development --platform android
  ```

---

## 9. Git Safety & Working Tree Status

- **Zero Secrets Committed:** No `.env` credentials, private keys, or certificates are staged or included.
- **Zero Physical DB Migrations:** Physical databases were not mutated; SQL artifact preserved in `packages/database/prisma/migrations/`.
- **Git Working Tree:** Contains all verified Batch 8.5 changes across `apps/api`, `apps/mobile`, `packages/database`, `packages/shared-types`, and `packages/validation`.
- Awaiting user review and authorization prior to staging or committing.

