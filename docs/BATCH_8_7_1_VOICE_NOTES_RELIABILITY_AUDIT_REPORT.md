# Apna Samaj — Batch 8.7.1: Voice Message Reliability Audit Report

## 1. Executive Summary

This audit rigorously verifies and hardens the Voice Notes and Audio Messaging implementation delivered in Batch 8.7 across mobile, backend, offline persistence, and physical multi-tenant isolation boundaries.

All findings have been resolved with concrete architectural hardenings:
- **Zero Duplicate Audio Uploads:** Phase 1 attachment upload results are persisted to local storage immediately upon receipt. Subsequent retries or app restarts reuse the existing `storagePath` and avoid re-uploading binary audio files.
- **Backend Re-association Protection & Safe Reuse:** Re-transmitting an already-associated voice attachment by the original author with the same `clientMessageId` safely recovers and returns the existing message without throwing an attachment conflict error. Attempted attachment re-use by a different user or context is strictly rejected with HTTP 400.
- **Missing File Graceful Degradation:** If local recording files are purged by the operating system before upload, the outbox worker flags the message as permanently failed with a localized explanation rather than looping indefinitely.
- **Hardware Audio Cleanup & Background Transitions:** Integrated React Native `AppState` listeners to pause active voice recordings and playbacks when the app leaves the foreground, and hooked unmount teardown in both direct and group chat screens.
- **Cache Hydration Parity:** Hydrated cached and optimistic messages now preserve `duration` and `localUri`, giving immediate visual feedback and local playback capability.

---

## 2. Audio Upload Retry Safety Audit

### The Two-Phase Upload Flow
1. **Phase 1 (Attachment Upload):** The client transmits the raw audio file to `/api/v1/chat/conversations/:id/attachments` or `/api/v1/groups/:id/attachments`. The backend verifies membership/participation, inspects magic bytes (M4A, MP3, OGG, WAV, AAC, WebM), validates the 25MB ceiling, writes to private Supabase storage, and returns an attachment descriptor (`id`, `storagePath`, `fileSizeBytes`, `signedUrl`, `duration`).
2. **Phase 2 (Message Creation):** The client transmits the message referencing the canonical `storagePath` and `duration` with an idempotency key (`tempId` / `clientMessageId`).

### Audit Scenarios & Hardened Behaviors

| Scenario | Risk Before Hardening | Hardened Audit Behavior |
| :--- | :--- | :--- |
| **Upload succeeds, message creation fails** | Retrying would re-upload the same audio file to storage, creating orphan duplicates. | In `OutboxQueueService.transmitMessage`, `updateMessageAttachment` saves `uploaded.storagePath` immediately after Phase 1. Subsequent retries see `storagePath` already present and skip upload. |
| **Upload succeeds, client times out** | Client assumes message failed and tries to re-upload. | On timeout retry, `storagePath` is already recorded in local storage; client proceeds directly to Phase 2 with existing idempotency key. |
| **App restarts between Phase 1 and Phase 2** | Restored message lacked `storagePath` in local L2 storage. | `updateMessageAttachment` writes directly through `writeChunkedItem` to SecureStore/localStorage, ensuring app restarts resume Phase 2 directly. |
| **User manually retries failed voice message** | `retryMessage(tempId)` could duplicate storage uploads. | `retryMessage` invokes `transmitMessage`, which checks `!resolvedAttachment.storagePath` before uploading. If already uploaded, Phase 1 is skipped. |
| **Socket event arrives before REST response** | Duplicate message item rendered or optimistic item stranded. | In `useDirectChat` and `useGroupChat`, incoming socket event matches `payload.tempId` to the optimistic message, transitioning its status to `sent` and updating its server ID in-place. |
| **Attachment already associated with existing message** | Backend threw HTTP 400 `Attachment has already been associated`, breaking idempotent retry. | Both `chat.service.ts` and `direct-chat.service.ts` inspect the existing attachment's parent message. If `senderId` and `clientMessageId` match, the server returns the existing message cleanly. |
| **Unauthorized user attempts attachment reuse** | Unsanitized reuse could leak private audio or bypass quota. | If `senderId`, `groupId`, or `conversationId` does not match, HTTP 400 is strictly thrown. |

---

## 3. Local Recording Durability & Lifecycle

### Storage Location & Behavior
- **Default Recording Directory:** `expo-av` records audio to the platform cache directory (`cache/Audio/` on Android, `tmp/` or `Library/Caches` on iOS).
- **Restart Resilience:** If the device has not rebooted or executed an aggressive storage purge, local cache URIs remain valid across normal app restarts.
- **Handling Purged / Missing Local Files:** If the OS cleans the cache directory while the device is offline before upload occurs, `OutboxQueueService` catches the `ENOENT` / file not found error during Phase 1 upload and marks the message as `failed` with:
  `"Local audio recording file was deleted or cannot be found on device."`
  This halts infinite retry loops while informing the user clearly.
- **Post-Upload Local File Lifecycle:** Local recordings are retained in cache during active sessions to facilitate zero-latency offline playback without re-fetching signed URLs from Supabase.

---

## 4. Logout & Community Switch Safety

### Invariants Verified
1. **Worker Teardown Prior to Context Switch:** In `AuthContext.tsx`, `switchCommunity` and `logout` invoke `outboxQueueService.teardown()` before tokens or community slugs are cleared. All active timers and intervals are cancelled.
2. **Namespace Segregation:** Persistent outbox records are keyed as `@apnasamaj:chat:msg:${tenantSlug}:${userId}:${tempId}` and `@apnasamaj:chat:outbox:${tenantSlug}:${userId}`. A session change clears in-memory L1 cache (`evictMemorySession()`), leaving physical records intact in their respective namespace.
3. **Cross-Tenant Upload Prevention:** In `OutboxQueueService.processConversationQueue`, every message item is checked:
   ```ts
   if (msg.tenantSlug !== this.activeTenantSlug || msg.userId !== this.activeUserId) {
     break;
   }
   ```
   A queued message from `tenant-a` is never transmitted with `tenant-b` credentials.
4. **Resumption on Re-authentication:** When the original user re-authenticates to the original community, `outboxQueueService.initialize(slug, userId)` re-hydrates the outbox queue and resumes pending voice uploads seamlessly.
5. **Destructive Action Confirmation:** Both `handleSwitchCommunity` and `handleLogout` in `settings.tsx` require explicit user confirmation via native `Alert.alert` or Web `confirm` dialogs warning that the active session will terminate.

---

## 5. Audio Security & Privacy Guarantees

1. **Private Storage:** All voice notes are stored in private Supabase bucket `chat-attachments` (`public: false`).
2. **Ephemeral Signed URLs:** Temporary signed URLs are generated with short-lived expiration (1 hour) and are **never** written to persistent local storage (`ChatPersistenceService` explicitly strips signed URLs before serialization).
3. **Multi-Tenant Physical Isolation:** All database queries utilize tenant-scoped Prisma client `req.db` validated via `assertDb(req.db)`.
4. **Server-Side Binary Magic-Byte Inspection:** The storage service scans binary header signatures for M4A (`ftypM4A `), MP3 (`ID3` or sync frame), OGG (`OggS`), WAV (`RIFF....WAVE`), AAC (`0xFFF1` / `0xFFF9`), and WebM (`0x1A45DFA3`). Executables (`MZ`, `ELF`), APKs, and shell scripts are rejected regardless of file extension.
5. **25MB Size Ceiling:** Enforced on the backend via `CHAT_MAX_AUDIO_BYTES = 25 * 1024 * 1024`.
6. **Authorization Gates (`getChatAttachmentDetails`):**
   - Direct Chat: Verifies `conversation.userOneId === userId || conversation.userTwoId === userId`. Third parties receive HTTP 403 `ForbiddenChatError`.
   - Group Chat: For private groups, verifies active membership via `groupMember.findUnique`. Non-members receive HTTP 403 `ForbiddenChatError`.

---

## 6. Expo SDK 52 & Hardware Audio Compatibility

1. **`expo-av@~15.0.2` Compatibility:** Fully compatible with Expo SDK 52, Expo Router v4, Hermes engine, and React Native 0.76.9.
2. **Permissions:**
   - Android: `android.permission.RECORD_AUDIO` configured in `app.json`.
   - iOS: `NSMicrophoneUsageDescription` configured in `ios.infoPlist`.
   - Permissions requested on demand strictly when recording starts.
3. **Audio Session Interruptions & Background Transitions:**
   - `VoiceRecordingService` registers `AppState` listener. When the app transitions to `background` or `inactive`, active recording is paused to release native audio hardware handles without data loss.
   - `VoicePlaybackService` registers `AppState` listener. When the app leaves the foreground, active playback pauses automatically.
4. **Screen Teardown:** Added unmount `useEffect` hooks in `chat/[id].tsx` and `group/[slug]/chat.tsx` to ensure `voicePlaybackService.stop()` and `voiceRecordingService.cancelRecording()` are called when the user navigates away from chat screens.

---

## 7. Automated Test Verification Results

All test suites executed cleanly:

| Suite | Scope / Command | Result |
| :--- | :--- | :--- |
| **Mobile Voice Notes & Reliability Suite** | `npm test --workspace=@apnasamaj/mobile` (voice notes flow) | **16/16 Passed** |
| **Cumulative Mobile Suite** | `npm test --workspace=@apnasamaj/mobile` (all 14 mobile suites) | **216/216 Passed** |
| **Backend Voice Notes & Storage Suite** | `npx tsx apps/api/src/tests/voice-notes-backend.test.ts` | **12/12 Passed** |
| **Chat Backend Idempotency Suite** | `npx tsx apps/api/src/tests/chat-idempotency.test.ts` | **20/20 Passed** |
| **Direct Messaging Flow Suite** | `npx tsx apps/api/src/tests/direct-messaging-flow.test.ts` | **41/41 Passed** |
| **Chat Media Attachments Suite** | `npx tsx apps/api/src/tests/chat-media-attachments.test.ts` | **29/29 Passed** |
| **FCM Push Notifications Suite** | `npx tsx apps/api/src/tests/push-notifications.test.ts` | **51/51 Passed** |
| **Monorepo Typecheck** | `npm run typecheck --workspaces --if-present` | **0 Errors (All 9 workspaces)** |
| **Monorepo Production Build** | `npm run build` | **Code 0 (Admin, API, Web, DB, Shared)** |
| **Expo Web Bundling** | `npx expo export --platform web` | **Code 0 (246 kB bundle)** |

---

## 8. Working Tree State

`git status --short`:
```
 M apps/api/src/middleware/upload.middleware.ts
 M apps/api/src/modules/chat/chat.controller.ts
 M apps/api/src/modules/chat/chat.service.ts
 M apps/api/src/modules/chat/direct-chat.controller.ts
 M apps/api/src/modules/chat/direct-chat.service.ts
 M apps/api/src/services/storage.service.ts
 M apps/mobile/app.json
 M apps/mobile/app/(app)/chat/[id].tsx
 M apps/mobile/app/(app)/group/[slug]/chat.tsx
 M apps/mobile/package.json
 M apps/mobile/src/components/chat/index.ts
 M apps/mobile/src/hooks/useDirectChat.ts
 M apps/mobile/src/hooks/useGroupChat.ts
 M apps/mobile/src/services/chat-persistence.service.ts
 M apps/mobile/src/services/index.ts
 M apps/mobile/src/services/outbox-queue.service.ts
 M apps/mobile/src/tests/test-runner.ts
 M docs/MOBILE_APP_DEVELOPMENT_DASHBOARD.md
 M docs/PROJECT_HISTORY.md
 M package-lock.json
 M packages/database/prisma/schema.prisma
 M packages/shared-types/src/chat.ts
 M packages/validation/src/chat.ts
?? apps/api/src/tests/voice-notes-backend.test.ts
?? apps/mobile/src/components/chat/AudioWaveform.tsx
?? apps/mobile/src/components/chat/ChatAudioMessage.tsx
?? apps/mobile/src/components/chat/VoiceRecorder.tsx
?? apps/mobile/src/services/audio/
?? apps/mobile/src/tests/mocks/expo-av.ts
?? apps/mobile/src/tests/voice-notes-flow.test.ts
?? docs/BATCH_8_7_1_VOICE_NOTES_RELIABILITY_AUDIT_REPORT.md
?? docs/BATCH_8_7_VOICE_NOTES_REPORT.md
?? packages/database/prisma/migrations/20261106160000_add_chat_attachment_audio_type/
```
