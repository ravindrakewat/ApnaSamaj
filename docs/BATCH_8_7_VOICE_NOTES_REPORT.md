# Apna Samaj — Batch 8.7: Mobile Voice Notes & Audio Messaging Report

- **Batch Identifier:** Batch 8.7 (Mobile Track)
- **Date:** November 6, 2026
- **Status:** ✅ Completed & Fully Verified (Working Tree Preserved for User Audit)
- **Branch:** `main` (base commit: `7fb6b29cb481dec7ddd20978c28a1e3190c14b12`)
- **Workspaces Involved:** `apps/mobile`, `apps/api`, `packages/database`, `packages/shared-types`, `packages/validation`

---

## 1. Executive Summary

Batch 8.7 implements a production-grade, WhatsApp-style **Voice Notes & Audio Messaging** system across both **Personal One-to-One Chat** and **Community Group Chat** in Apna Samaj.

Built specifically for low-latency Indian mobile network conditions and multilingual community interactions, members can record, preview, send, and listen to high-quality audio voice notes with smooth visual waveform scrubbing, playback speed toggles (1x, 1.5x, 2x), single-playback concurrency locks, offline outbox persistence with mid-flight crash recovery, and multi-tenant physical storage isolation.

### Key Architectural Highlights:
1. **On-Demand Permissions:** Microphone access is requested strictly when the user taps the record button, never on application startup or navigation.
2. **Platform-Compatible Audio Engine:** Powered by `expo-av@~15.0.2` (official Expo SDK 52 dependency), recording in high-quality AAC/M4A format across Android, iOS, and Web.
3. **Interactive Recording UI:** WhatsApp-like bottom-sheet interface featuring live recording duration timer (`MM:SS`), live amplitude waveform visualization, pause/resume controls, cancel/trash cleanup, and stop-and-preview before dispatch.
4. **Lightweight Waveform Visualizer:** 26-bar scrubber component with single-tap position seeking, real-time progress fill, and non-blocking rendering.
5. **Single-Playback Concurrency:** `VoicePlaybackService` singleton enforces that only one audio track can play at a time across the entire application; starting a new voice note automatically stops and unloads the previous track.
6. **Signed URL Expiration Resilience:** Automatically intercepts expired signed URLs (15-min TTL) and transparently refreshes them via `GET /api/v1/chat/attachments/:id/url` without user intervention.
7. **Offline Outbox & Two-Phase Sync:** Recordings created offline are persisted with local file references (`localUri`). When network restores, `OutboxQueueService` executes a two-phase dispatch (uploads audio to Supabase Storage first, then commits the chat message with stable idempotency keys) and safely cleans up temporary local files.
8. **Multi-Tenant Physical Isolation:** Private Supabase Storage bucket (`chat-attachments`, `public: false`) with isolated tenant partitions (`direct/{tenantSlug}/{conversationId}/...` and `groups/{tenantSlug}/{groupId}/...`).
9. **Strict Content Integrity:** Magic-byte inspection validates binary audio headers (M4A/ISO-BMFF, MP3/ID3, OGG/OggS, WAV/RIFF, AAC/ADTS) and rejects malicious executables (`MZ`, `ELF`, `#!) with HTTP 400.

---

## 2. Architecture & File Breakdown

### Phase 1 & 6: Database, Validation & Storage Backend

#### 1. Prisma Schema & Migration SQL Artifact:
- Updated [`packages/database/prisma/schema.prisma`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\packages\database\prisma\schema.prisma):
  - Added `AUDIO` to `enum MediaType`:
    ```prisma
    enum MediaType {
      IMAGE
      VIDEO
      DOCUMENT
      AUDIO
    }
    ```
  - Added optional `duration Int?` to `model ChatAttachment` to store voice note duration in seconds.
- Generated migration SQL artifact:
  [`packages/database/prisma/migrations/20261106160000_add_chat_attachment_audio_type/migration.sql`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\packages\database\prisma\migrations\20261106160000_add_chat_attachment_audio_type\migration.sql):
  ```sql
  -- AlterEnum
  ALTER TYPE "MediaType" ADD VALUE 'AUDIO';

  -- AlterTable
  ALTER TABLE "ChatAttachment" ADD COLUMN "duration" INTEGER;
  ```
  *(Strict monorepo rule observed: Migration SQL artifact generated only; no database migrations executed against live databases).*
- Regenerated Prisma Client via `npm run db:generate`.

#### 2. Shared Types & Zod Validation:
- Updated [`packages/shared-types/src/chat.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\packages\shared-types\src\chat.ts):
  - Expanded `ChatAttachmentType` union: `'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO'`.
  - Added optional `duration?: number` and `localUri?: string` to `ChatAttachmentItem` and `ChatAttachmentInput`.
- Updated [`packages/validation/src/chat.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\packages\validation\src\chat.ts):
  - Added `'AUDIO'` to `chatAttachmentInputSchema` enum.
  - Added optional `duration` and `localUri` validation rules.

#### 3. Storage Service & Upload Middleware:
- Updated [`apps/api/src/middleware/upload.middleware.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\api\src\middleware\upload.middleware.ts):
  - Added audio MIME types: `audio/m4a`, `audio/mp4`, `audio/aac`, `audio/ogg`, `audio/webm`, `audio/wav`, `audio/mpeg`, `audio/x-m4a`, `audio/3gpp`, `audio/opus`.
  - Added audio extensions: `.m4a`, `.aac`, `.mp3`, `.ogg`, `.opus`, `.wav`, `.webm`, `.3gp`.
- Updated [`apps/api/src/services/storage.service.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\api\src\services\storage.service.ts):
  - Added `CHAT_MAX_AUDIO_BYTES = 25 * 1024 * 1024` (25MB).
  - Enhanced `detectChatAttachmentTypeAndMime` to inspect binary signatures:
    - M4A: ISO-BMFF box with `ftyp` and `M4A ` brand.
    - MP3: ID3 header (`0x49 0x44 0x33`) or MPEG frame sync (`0xFF 0xEx`).
    - OGG: `OggS` container header (`0x4F 0x47 0x47 0x53`).
    - WAV: RIFF header with `WAVE` format descriptor.
    - AAC: ADTS sync word (`0xFF 0xF1` / `0xFF 0xF9`).
    - WebM Audio: EBML header (`0x1A 0x45 0xDF 0xA3`).
  - Added automatic bucket MIME capability updates to ensure private storage allows audio uploads.

---

### Phase 2, 4 & 5: Mobile Services

#### 1. Voice Recording Service
Created [`apps/mobile/src/services/audio/voice-recording.service.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\src\services\audio\voice-recording.service.ts):
- `requestPermissions()`: Prompts for microphone access on demand.
- `startRecording()`: Initializes `Audio.Recording` with `Audio.RecordingOptionsPresets.HIGH_QUALITY` and normalized metering amplitude capture (0.0 .. 1.0).
- `pauseRecording()` / `resumeRecording()`: Pauses and resumes recording without dropping recorded duration.
- `stopRecording()`: Stops and unloads recording; returns local file URI, total duration in milliseconds and seconds, and amplitude array.
- `cancelRecording()`: Stops hardware recording and immediately deletes uncommitted temporary files.
- Concurrency guard: Throws if another recording is already active.

#### 2. Voice Playback Service
Created [`apps/mobile/src/services/audio/voice-playback.service.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\src\services\audio\voice-playback.service.ts):
- Single-player singleton: Stops and unloads any active audio before starting a new track.
- `play(params)`: Plays from local URI or signed URL; intercepts expired URL errors and automatically requests a fresh signed URL via `chatApi.getAttachmentUrl()`.
- `pause()` / `resume()`: Controls playback without losing position.
- `seek(positionMillis)`: Seeks to target timestamp.
- `togglePlaybackRate()`: Cycles playback rate through `1.0x` -> `1.5x` -> `2.0x` -> `1.0x` with pitch preservation (`shouldCorrectPitch: true`).
- `stop()`: Completely releases hardware audio handles.

---

### Phase 3 & 9: Mobile UI Components

#### 1. `AudioWaveform.tsx`
Created [`apps/mobile/src/components/chat/AudioWaveform.tsx`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\src\components\chat\AudioWaveform.tsx):
- 26 vertical bar scrubber.
- Dynamic color fill reflecting active playback progress.
- Single-tap scrubber seeking (`onSeek` percentage callback).
- Deterministic visual waveform fallback for imported audio files without stored amplitude arrays.

#### 2. `VoiceRecorder.tsx`
Created [`apps/mobile/src/components/chat/VoiceRecorder.tsx`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\src\components\chat\VoiceRecorder.tsx):
- Idle state: WhatsApp-style circular microphone button beside composer.
- Recording state: Expands to full-width recording bar with red blinking recording dot, live duration timer (`MM:SS`), live amplitude waveform, pause/resume, cancel (trash), and preview controls.
- Stop & Preview mode: Allows user to listen to their voice note and scrub through it before deciding to send or discard.

#### 3. `ChatAudioMessage.tsx`
Created [`apps/mobile/src/components/chat/ChatAudioMessage.tsx`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\src\components\chat\ChatAudioMessage.tsx):
- Bubble component for sent and received audio messages.
- Circular Play/Pause button (`▶` / `⏸`).
- Scrubber waveform with elapsed and total duration (`0:15 / 0:42`).
- Speed pill (`1x`, `1.5x`, `2x`).
- Delivery status badges (`🕒`, `⏳`, `✓`, `✓✓`, `⚠️`) and retry trigger for failed voice notes.

#### 4. Chat Screens Integration:
- [`apps/mobile/app/(app)/chat/[id].tsx`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\app\(app)\chat\[id].tsx) (Personal One-to-One Chat)
- [`apps/mobile/app/(app)/group/[slug]/chat.tsx`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\app\(app)\group\[slug]\chat.tsx) (Community Group Chat)
- Composer dynamically swaps between Send button (`➤`) and Microphone button (`🎙️`) depending on whether text/attachments are staged.

---

### Phase 8: Offline Outbox Queue Integration

Updated [`apps/mobile/src/services/outbox-queue.service.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\src\services\outbox-queue.service.ts):
- Added two-phase upload support in `transmitMessage()`:
  - Detects if `msg.attachment` has a `localUri` and empty `storagePath`.
  - Automatically uploads the local audio file to the authorized endpoint (`/chat/conversations/:id/attachments` or `/groups/:id/attachments`).
  - Upon upload success, associates the server `storagePath` and submits the message with client idempotency key (`tempId`).
  - Preserves local file URI if offline; automatically resumes when network reconnects or app foregrounds.

---

## 3. Automated Test Verification Results

### A. Mobile Voice Notes & Audio Messaging Suite
Ran `npm test --workspace=@apnasamaj/mobile` (executing [`apps/mobile/src/tests/voice-notes-flow.test.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\mobile\src\tests\voice-notes-flow.test.ts)):

```text
--- Running Batch 8.7 Voice Notes & Audio Messaging Mobile Test Suite ---
✓ 1. Permission Handling: Microphone permission granted correctly
✓ 2. Permission Handling: Rejected permission throws PERMISSION_DENIED and blocks recording
✓ 3. Recording Lifecycle: Start, pause, and resume execute successfully
✓ 4. Concurrency Guard: Multiple simultaneous recordings are prevented
✓ 5. Recording Stop: File URI, duration, and amplitude metrics generated
✓ 6. Cancel Cleanup: Unsaved recording resources released cleanly on cancellation
✓ 7. Audio Playback: Play, pause, and resume operate seamlessly
✓ 8. Playback Speed: Speed toggling cycles through 1x, 1.5x, 2x
✓ 9. Single Playback Lock: Only one voice note can play at a time
✓ 10. Playback Seek & Teardown: Seeking and unmounting release hardware handles
✓ 11. Offline Voice Persistence: Local recording references and duration safely stored
✓ 12. App Restart Recovery: Pending voice recording references persist across sessions
✓ 13. Two-Phase Outbox Dispatch: Automatic upload followed by idempotent message creation

--- Batch 8.7 Mobile Test Suite: All 13/13 Tests Passed Successfully ---
```

### B. Backend Audio Storage & Service Integration Suite
Ran `npx tsx apps/api/src/tests/voice-notes-backend.test.ts`:

```text
--- Running Batch 8.7 Voice Notes & Audio Messaging Backend Test Suite ---
✓ 1. MIME Detection: M4A audio detected via ISO-BMFF header
✓ 2. MIME Detection: MP3 audio detected via ID3 header
✓ 3. MIME Detection: OGG/OPUS audio detected via OggS signature
✓ 4. MIME Detection: WAV audio detected via RIFF-WAVE header
✓ 5. Security: Dangerous executables and scripts spoofing audio extensions rejected
✓ 6. Upload Pipeline: Audio upload returns valid type, storagePath, signed URL, and duration
✓ 7. Size Ceiling: Oversized audio (>25MB) rejected with OversizedFileError
✓ 8. Group Chat Service: Voice message created with duration metadata
✓ 9. Direct Chat Service: Voice message created with duration metadata
✓ 10. Idempotency & Duplicate Prevention: Re-transmitting same voice note returns cached original

--- Batch 8.7 Backend Test Suite: All 10/10 Tests Passed Successfully ---
```

### C. Full Monorepo Regression Verification

| Test Suite | File | Assertions / Tests | Result |
| :--- | :--- | :---: | :---: |
| **Mobile Foundation & Core Modules** | `apps/mobile/src/tests/test-runner.ts` | 213/213 passed | ✅ **PASS** |
| **Backend Voice Notes & Storage** | `apps/api/src/tests/voice-notes-backend.test.ts` | 10/10 passed | ✅ **PASS** |
| **Backend Idempotency & Outbox** | `apps/api/src/tests/chat-idempotency.test.ts` | 20/20 passed | ✅ **PASS** |
| **Backend Media Attachments** | `apps/api/src/tests/chat-media-attachments.test.ts` | 29/29 passed | ✅ **PASS** |
| **Backend Direct Messaging** | `apps/api/src/tests/direct-messaging-flow.test.ts` | 41/41 passed | ✅ **PASS** |
| **Backend FCM Notifications** | `apps/api/src/tests/push-notifications.test.ts` | 51/51 passed | ✅ **PASS** |
| **Monorepo Typecheck** | `npm run typecheck --workspaces --if-present` | 9 workspaces (0 errors) | ✅ **PASS** |
| **Production Build** | `npm run build` | All packages & apps built | ✅ **PASS** |
| **Expo Web Bundling** | `npx expo export --platform web` | 246 kB bundle export | ✅ **PASS** |

---

## 4. Security, Privacy & Invariants

1. **Permission Hygiene:** Microphones are never polled or opened on mount. The user must explicitly tap the microphone button.
2. **Signed URLs Never Stored:** Neither `localStorage` nor `SecureStore` caches temporary signed URLs. Only canonical paths and local device file URIs are persisted locally.
3. **Tenant & Conversation Partitioning:** Voice notes cannot cross tenant boundaries. Direct messages check participant IDs; group messages enforce active community membership.
4. **Idempotency Guarantee:** Retrying voice note dispatch with the same `tempId` returns the existing message rather than duplicating recordings or records in PostgreSQL.
5. **Session Teardown:** Changing communities or logging out immediately stops audio recording and playback, evicts memory handles, and isolates persistent files.

---

## 5. Summary of Files Changed

### New Files Created:
1. `apps/mobile/src/services/audio/voice-recording.service.ts`
2. `apps/mobile/src/services/audio/voice-playback.service.ts`
3. `apps/mobile/src/services/audio/index.ts`
4. `apps/mobile/src/components/chat/AudioWaveform.tsx`
5. `apps/mobile/src/components/chat/VoiceRecorder.tsx`
6. `apps/mobile/src/components/chat/ChatAudioMessage.tsx`
7. `apps/mobile/src/tests/mocks/expo-av.ts`
8. `apps/mobile/src/tests/voice-notes-flow.test.ts`
9. `apps/api/src/tests/voice-notes-backend.test.ts`
10. `packages/database/prisma/migrations/20261106160000_add_chat_attachment_audio_type/migration.sql`
11. `docs/BATCH_8_7_VOICE_NOTES_REPORT.md`

### Modified Files:
1. `apps/mobile/package.json` — Added `expo-av@~15.0.2`
2. `apps/mobile/app.json` — Added microphone permissions (`NSMicrophoneUsageDescription` & `RECORD_AUDIO`)
3. `packages/database/prisma/schema.prisma` — Added `AUDIO` to `MediaType` enum and `duration Int?` to `ChatAttachment`
4. `packages/shared-types/src/chat.ts` — Added `'AUDIO'`, `duration`, `localUri`
5. `packages/validation/src/chat.ts` — Added `'AUDIO'`, `duration`, `localUri` schemas
6. `apps/api/src/middleware/upload.middleware.ts` — Added audio MIME types and extensions
7. `apps/api/src/services/storage.service.ts` — Added audio magic bytes inspection, size ceiling, and bucket capabilities
8. `apps/api/src/modules/chat/chat.controller.ts` — Extracted and passed `duration` parameter
9. `apps/api/src/modules/chat/direct-chat.controller.ts` — Extracted and passed `duration` parameter
10. `apps/api/src/modules/chat/chat.service.ts` — Saved and mapped `duration`
11. `apps/api/src/modules/chat/direct-chat.service.ts` — Saved and mapped `duration`
12. `apps/mobile/src/components/chat/index.ts` — Exported audio components
13. `apps/mobile/src/services/index.ts` — Exported audio services
14. `apps/mobile/src/services/chat-persistence.service.ts` — Persisted `duration` and `localUri`
15. `apps/mobile/src/services/outbox-queue.service.ts` — Added two-phase upload for offline recordings
16. `apps/mobile/app/(app)/chat/[id].tsx` — Integrated voice recorder and audio message renderer
17. `apps/mobile/app/(app)/group/[slug]/chat.tsx` — Integrated voice recorder and audio message renderer
18. `apps/mobile/src/tests/test-runner.ts` — Registered `expo-av` mock and voice note test suite
19. `docs/MOBILE_APP_DEVELOPMENT_DASHBOARD.md` — Updated roadmap and milestone checkboxes
20. `docs/PROJECT_HISTORY.md` — Documented Batch 8.7 completion

---

## 6. Recommended Next Batch

- **Batch 8.8 (Mobile Track) — Chat Message Reactions, Replies & Quoted Messages**
  Allow members to react with emojis (👍, ❤️, 😂, 😮, 😢, 🙏) and swipe-to-reply with quoted message previews in Personal and Group chats.
