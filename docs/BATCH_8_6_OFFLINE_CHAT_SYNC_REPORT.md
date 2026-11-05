# Apna Samaj — Batch 8.6: Offline Chat Sync & Outbox Message Queue Report

**Batch Identifier:** Batch 8.6 (Mobile Track)  
**Date:** November 5, 2026  
**Status:** ✅ Completed & Fully Verified (Working Tree Preserved)  
**Branch:** `main` (at `e4d8593eff2d4c47322504609a67344769f1515c`)  
**Workspace:** Monorepo (`apps/mobile`, `apps/api`, `packages/database`, `packages/shared-types`)  

---

## 1. Executive Summary

Batch 8.6 implements a production-grade, offline-first synchronization and outbox message queue system for both **Personal One-to-One Chat** and **Community Group Chat** in Apna Samaj. 

Under real-world Indian mobile conditions (spotty cellular coverage, transit dead zones, intermittent Wi-Fi), users can compose and send messages regardless of connectivity. Messages display immediately with optimistic feedback, persist safely across application restarts, queue locally in strict conversational FIFO order, and automatically synchronize upon network restoration with strict backend idempotency, duplicate prevention, and physical multi-tenant isolation.

### Key Architectural Achievements:
1. **Zero Message Loss Guarantee:** Outgoing messages persist to local storage before network dispatch.
2. **Android Keystore Overflow Protection:** Transparent 1024-byte chunking prevents Android Keystore 2048-byte limit crashes on long messages without adding new native dependencies.
3. **Conversational FIFO Order:** Outbox messages queue and transmit sequentially per conversation (`conversationId`), preserving conversation semantics (e.g., "Yes" cannot arrive before "Are you there?"), while allowing distinct conversations to transmit concurrently.
4. **Backend Idempotency & Unique Scoping:** Backend `ChatIdempotencyService` with in-flight Promise collapsing, 5-minute deduplication cache, and database-level `@@unique` compound constraints (`[groupId, senderId, clientMessageId]` and `[conversationId, senderId, clientMessageId]`).
5. **Mid-Flight Crash Recovery:** Automatic recovery of messages stuck in `sending` status back to `pending` upon application restart or crash.
6. **Exponential Backoff with Jitter:** Transient network failures retry with jittered delays (2s, 5s, 10s, 30s, 60s; capped at 5 retries), while permanent 4xx errors (400, 403, 404) immediately fail permanently without retrying.
7. **Offline User Experience:** Real-time offline banners, dynamic delivery status badges (`🕒` pending, `⏳` sending, `✓` sent, `✓✓` read, `⚠️` failed), single-tap retry buttons, and offline media attachment guards.

---

## 2. Architecture & Implementation Breakdown

### Phase 1 & 4: Database Schema, Migration SQL & Backend Idempotency

#### Database Schema Changes:
Updated [`packages/database/prisma/schema.prisma`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/schema.prisma):
- Added `clientMessageId String?` to `ChatMessage` with compound unique index `@@unique([groupId, senderId, clientMessageId])`.
- Added `clientMessageId String?` to `DirectMessage` with compound unique index `@@unique([conversationId, senderId, clientMessageId])`.
- Generated Prisma Client via `npm run db:generate`.

#### Migration SQL Artifact:
Created [`packages/database/prisma/migrations/20261105183000_add_chat_idempotency_client_message_id/migration.sql`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/migrations/20261105183000_add_chat_idempotency_client_message_id/migration.sql) with PostgreSQL DDL:
```sql
ALTER TABLE "ChatMessage" ADD COLUMN "clientMessageId" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN "clientMessageId" TEXT;
CREATE UNIQUE INDEX "ChatMessage_groupId_senderId_clientMessageId_key" ON "ChatMessage"("groupId", "senderId", "clientMessageId");
CREATE UNIQUE INDEX "DirectMessage_conversationId_senderId_clientMessageId_key" ON "DirectMessage"("conversationId", "senderId", "clientMessageId");
```
*(Strict safety followed: Migration SQL generated only; no live database migrations executed).*

#### Backend Idempotency Engine:
Created [`apps/api/src/modules/chat/chat-idempotency.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/chat-idempotency.service.ts):
- Scoped cache key: `${tenantSlug}:${contextType}:${contextId}:${senderId}:${clientMessageId}`.
- In-flight Promise collapsing: Concurrent requests with identical idempotency keys share the same execution Promise, preventing race-condition duplicates.
- Completed response cache: Successful transmissions cached for 5 minutes (TTL 300,000 ms with bounded 5,000 item capacity).
- Database unique constraint collision recovery (`P2002`): Queries and returns existing record if database catches duplicate.
- Updated [`apps/api/src/modules/chat/chat.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/chat.service.ts) and [`apps/api/src/modules/chat/direct-chat.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/direct-chat.service.ts) with explicit type-guarded overload resolution (`isPrismaClient`, `isChatAttachmentInput`).

---

### Phase 2: Mobile Persistence Layer (`ChatPersistenceService`)

Created [`apps/mobile/src/services/chat-persistence.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/services/chat-persistence.service.ts):
- **Two-Tier Storage Architecture:**
  - **L1 Fast Lookup:** In-memory `Map<string, LocalChatMessage>` for instantaneous UI rendering (0 ms latency).
  - **L2 Persistent Storage:** Backed by `expo-secure-store` on Android/iOS (and `window.localStorage` on Web) for crash resilience.
- **1024-Byte Chunking Mechanism:**
  - Android Keystore has a strict 2048-byte limit per key.
  - Messages and metadata exceeding 1024 bytes are automatically split across numbered subkeys (`${baseKey}:c0`, `${baseKey}:c1`) with count header `${baseKey}:chk_cnt`.
  - Reassembled seamlessly on retrieval.
- **Tenant & User Namespace Isolation:**
  - Keys formatted as `@apnasamaj:chat:outbox:${tenantSlug}:${userId}` and `@apnasamaj:chat:conv:${tenantSlug}:${convId}`.
  - Foreign tenants or users cannot read or modify another member's local chat history.
- **Bounded LRU Cache:**
  - Caps cached messages per conversation at 50 to prevent unbounded mobile storage growth on low-end devices.
- **Crash Recovery:**
  - `recoverStuckSendingMessages`: Scans outbox on startup; any message left in `sending` status from an app kill/crash resets to `pending`.

---

### Phase 3: Outbox Message Queue (`OutboxQueueService`)

Created [`apps/mobile/src/services/outbox-queue.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/services/outbox-queue.service.ts):
- **Conversational FIFO Dispatch:**
  - Pending messages grouped by `conversationId`.
  - Messages inside each conversation are processed sequentially in strict FIFO creation order.
  - Distinct conversations execute concurrently for high throughput.
- **Concurrency & Re-entrancy Locks:**
  - `processingLocks` (`Set<string>` of `tempId`) prevents duplicate concurrent dispatches.
  - `conversationLocks` (`Set<string>` of `conversationId`) prevents out-of-order message dispatch.
- **Intelligent Retry Policy:**
  - **Transient Errors (network drops, 500, 502, 503):** Exponential backoff with random jitter: `[2s, 5s, 10s, 30s, 60s]`. Capped at 5 retries.
  - **Permanent Errors (400, 403, 404, banned, member invalid):** Immediately marks status as `failed` without retrying.
- **App Lifecycle Integration:**
  - `AppState.addEventListener('change')`: Automatically drains outbox when app returns to foreground (`active`).
  - Network state change hook: Reconnection immediately triggers `processQueue()`.
- **Session Cleanup:**
  - Integrates with [`apps/mobile/src/context/AuthContext.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/context/AuthContext.tsx) to tear down workers and purge caches on `logout` and `switchCommunity`.

---

### Phase 5 & 6: Chat Hooks & UI Enhancements

#### Hooks:
- [`apps/mobile/src/hooks/useDirectChat.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/hooks/useDirectChat.ts):
  - Hydrates messages from local L1/L2 cache on mount before network fetch.
  - Subscribes to `outboxQueueService` status changes.
  - Injects `isOffline` and `retryMessage` handlers.
- [`apps/mobile/src/hooks/useGroupChat.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/hooks/useGroupChat.ts):
  - Hydrates messages from local L1/L2 cache on mount.
  - Subscribes to `outboxQueueService` status changes.
  - Injects `isOffline` and `retryMessage` handlers.

#### UI Screens:
- [`apps/mobile/app/(app)/chat/[id].tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/app/(app)/chat/[id].tsx):
  - **Offline Banner:** Persistent contextual banner when offline (`⚠️ आप ऑफ़लाइन हैं...`).
  - **Status Indicators:**
    - `🕒` (Pending / Outbox Queued)
    - `⏳` (Sending)
    - `✓` (Sent to Server)
    - `✓✓` (Read by Recipient)
    - `⚠️` (Failed)
  - **Single-Tap Retry:** Tapping `⚠️` or failed badge invokes `retryMessage(msg.tempId)`.
  - **Offline Media Guard:** Displays native alert informing user that large media uploads require an active internet connection.
- [`apps/mobile/app/(app)/group/[slug]/chat.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/app/(app)/group/[slug]/chat.tsx):
  - Matches personal chat offline banners, status indicators, retry triggers, and media upload guards.

---

## 3. Automated Test Verification Summary

### A. Mobile Offline Chat Sync & Outbox Test Suite
Executed [`apps/mobile/src/tests/offline-chat-sync-flow.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/tests/offline-chat-sync-flow.test.ts) via `npm test --workspace=@apnasamaj/mobile`:

| # | Test Scenario | Result |
|:---|:---|:---:|
| 1 | Save pending message with initial `pending` deliveryStatus | ✅ PASS |
| 2 | Temporary client ID (`tempId`) preserved | ✅ PASS |
| 3 | Initial retry count is 0 | ✅ PASS |
| 4 | Chunked message (>1024 bytes) saved and retrieved from storage | ✅ PASS |
| 5 | Chunked content cleanly reassembled without truncation (2500 chars) | ✅ PASS |
| 6 | Delivery status transitions cleanly (`pending` -> `sending` -> `sent`) | ✅ PASS |
| 7 | Sent message automatically removed from outbox queue index | ✅ PASS |
| 8 | Messages survive simulated app restart via persistent storage | ✅ PASS |
| 9 | Restored message preserves sent delivery status and serverMessageId | ✅ PASS |
| 10 | Tenant A messages strictly invisible in Tenant B context | ✅ PASS |
| 11 | User 1 outbox messages strictly invisible to User 2 | ✅ PASS |
| 12 | Bounded local cache safely capped at 50 items | ✅ PASS |
| 13 | Online message immediately transmitted through API | ✅ PASS |
| 14 | No network requests dispatched while device is offline | ✅ PASS |
| 15 | Queued offline messages automatically transmitted on network reconnect | ✅ PASS |
| 16 | Messages dispatched in strict conversational FIFO order | ✅ PASS |
| 17 | Successfully recovered stuck `sending` message back to `pending` on restart | ✅ PASS |
| 18 | Permanent 403 error attempted exactly once without infinite retries | ✅ PASS |
| 19 | Permanent error marked as `failed` immediately | ✅ PASS |
| 20 | Local cache purged completely on logout teardown | ✅ PASS |
| **Total** | **Batch 8.6 Mobile Test Suite** | **20 / 20 PASSED (100%)** |

---

### B. Backend Chat Idempotency Test Suite
Executed [`apps/api/src/tests/chat-idempotency.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/chat-idempotency.test.ts) via `npx tsx apps/api/src/tests/chat-idempotency.test.ts`:

| # | Test Scenario | Result |
|:---|:---|:---:|
| 1 | Idempotency key isolates by tenant slug | ✅ PASS |
| 2 | Idempotency key isolates by context type (GROUP vs DIRECT) | ✅ PASS |
| 3 | Key format matches expected template | ✅ PASS |
| 4 | Direct message created successfully with clientMessageId | ✅ PASS |
| 5 | Message content matches | ✅ PASS |
| 6 | clientMessageId stored in return item | ✅ PASS |
| 7 | Retry returned identical message ID without creating duplicate | ✅ PASS |
| 8 | Original creation timestamp preserved on duplicate retry | ✅ PASS |
| 9 | Concurrent duplicate requests collapse to single execution | ✅ PASS |
| 10 | Group message created with clientMessageId | ✅ PASS |
| 11 | Group clientMessageId preserved | ✅ PASS |
| 12 | Group message retry returned same ID without duplicate | ✅ PASS |
| 13 | Different senders with same tempId create distinct messages | ✅ PASS |
| 14 | Sender IDs accurately mapped | ✅ PASS |
| 15 | Same sender in different groups with same tempId creates distinct messages | ✅ PASS |
| 16 | Database-level unique constraint collision recovery (`P2002`) | ✅ PASS |
| 17 | Legacy messages without tempId create distinct entries normally | ✅ PASS |
| **Total** | **Backend Idempotency Test Suite** | **17 / 17 PASSED (100%)** |

---

### C. Backend Regression Test Verification
Ran all related backend chat and notification test suites:
- **Direct Messaging Flow Test:** [`apps/api/src/tests/direct-messaging-flow.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/direct-messaging-flow.test.ts) — **41 / 41 PASSED (100%)**
- **Chat Media Attachments Test:** [`apps/api/src/tests/chat-media-attachments.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/chat-media-attachments.test.ts) — **29 / 29 PASSED (100%)**
- **FCM Push Notifications Test:** [`apps/api/src/tests/push-notifications.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/push-notifications.test.ts) — **51 / 51 PASSED (100%)**

---

### D. Monorepo Typecheck & Production Build Verification
1. **TypeScript Typecheck:**
   - Ran `npm run typecheck --workspaces --if-present` across all 9 workspaces:
     - `@apnasamaj/admin` — 0 errors
     - `@apnasamaj/api` — 0 errors
     - `@apnasamaj/mobile` — 0 errors
     - `@apnasamaj/web` — 0 errors
     - `@apnasamaj/database` — 0 errors
     - `@apnasamaj/i18n` — 0 errors
     - `@apnasamaj/shared-types` — 0 errors
     - `@apnasamaj/ui-config` — 0 errors
     - `@apnasamaj/validation` — 0 errors
   - **Result:** **0 typecheck errors across all 9 workspaces.**
2. **Monorepo Build:**
   - Ran `npm run build --workspaces --if-present`:
     - `@apnasamaj/admin` — Vite build completed cleanly in 19.47s.
     - `@apnasamaj/api` — Prisma generate & TypeScript build completed cleanly.
     - `@apnasamaj/web` — Vite build completed cleanly in 19.07s.
     - `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation` — TypeScript build completed cleanly.
   - **Result:** **All workspaces built cleanly.**

---

## 4. Modified & Untracked Files

```text
Changes not staged for commit:
  M apps/api/src/modules/chat/chat.service.ts
  M apps/api/src/modules/chat/direct-chat.service.ts
  M apps/mobile/app/(app)/chat/[id].tsx
  M apps/mobile/app/(app)/group/[slug]/chat.tsx
  M apps/mobile/src/context/AuthContext.tsx
  M apps/mobile/src/hooks/useDirectChat.ts
  M apps/mobile/src/hooks/useGroupChat.ts
  M apps/mobile/src/tests/mocks/react-native.ts
  M apps/mobile/src/tests/test-runner.ts
  M packages/database/prisma/schema.prisma
  M packages/shared-types/src/chat.ts

Untracked files:
  ?? apps/api/src/modules/chat/chat-idempotency.service.ts
  ?? apps/api/src/tests/chat-idempotency.test.ts
  ?? apps/mobile/src/services/chat-persistence.service.ts
  ?? apps/mobile/src/services/index.ts
  ?? apps/mobile/src/services/outbox-queue.service.ts
  ?? apps/mobile/src/tests/offline-chat-sync-flow.test.ts
  ?? docs/BATCH_8_6_OFFLINE_CHAT_SYNC_REPORT.md
  ?? packages/database/prisma/migrations/20261105183000_add_chat_idempotency_client_message_id/
```

---

## 5. Security & Multi-Tenant Architectural Compliance

1. **Physical Multi-Tenant Database Isolation:**
   - All backend messages and unique constraint queries strictly route through `req.db` and are guarded with `assertDb(req.db)`.
   - Client message IDs are isolated per community database.
2. **Client-Side Cache Namespace Isolation:**
   - Local storage keys are prefixed with both `tenantSlug` and `userId`.
   - Switching communities or logging out triggers `chatPersistenceService.clearTenantCache` / `clearAllCache` to prevent cross-tenant data leakage.
3. **Zero Secrets In Working Tree:**
   - No credentials, tokens, or environment files committed.
4. **Git Safety Compliance:**
   - No Git commits, stages, pushes, or deployments were performed. Working tree is preserved cleanly for user review.

---

## 6. Batch 8.6.1 — Reliability Hardening

Following the initial completion of Batch 8.6, a comprehensive safety and reliability audit was conducted across mobile session management, SecureStore chunking, Web localStorage security, and cross-instance backend idempotency.

### A. Issues Found During Audit
1. **Unsent Message Destruction on Logout/Tenant Switch:**
   - `clearTenantCache` and `clearAllCache` previously deleted persistent outbox storage, destroying pending messages when a user logged out or switched communities while offline.
2. **Chunking Corruption & Missing Chunk Vulnerability:**
   - If writing was abruptly terminated or interrupted by an app crash, missing chunks (`chunk === null`) were silently skipped during retrieval, joining incomplete slices into corrupted strings.
3. **Obsolete Chunk Key Leakage:**
   - When an existing chunked record shrank to fewer chunks or to an unchunked single entry, old chunk keys (`:c2`, `:c3`, `:chk_cnt`) lingered orphaned in Keystore.
4. **Corrupted Chunk Header Vulnerability:**
   - Non-numeric or negative chunk count headers were parsed without bounds validation.
5. **Web Storage Token Exposure Risk:**
   - Incoming messages with temporary signed URLs (`url?: string`) could potentially store expiring access tokens in `localStorage`.
6. **Cross-Process Attachment Retry Failure:**
   - Retrying an attachment message with the same `tempId` threw HTTP 400 *"Attachment has already been associated with an existing message"* because the attachment uniqueness check executed before the idempotency check.
7. **Unbound In-Flight Retry Timers:**
   - Background `setTimeout` retry timers were not tracked or cancelled on `teardown()`, risking firing after logout or tenant switch.
8. **Missing Context Lock on Dispatch:**
   - The queue worker loop didn't verify whether the active session had changed between item dispatches.

---

### B. Fixes Implemented

#### 1. Safe Lifecycle & Data Preservation:
- **RAM Eviction vs Storage Deletion:** Replaced destructive cache clears on logout/switch with `chatPersistenceService.evictMemorySession()`. In-memory Map caches are immediately wiped to prevent RAM leakage between users, while persistent storage records in `@apnasamaj:chat:outbox:${tenantSlug}:${userId}` are preserved intact in their isolated namespace.
- **Automatic Queue Resumption:** [`AuthContext.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/context/AuthContext.tsx) initializes the outbox queue (`outboxQueueService.initialize(slug, user.id)`) on `login`, `register`, and `restoreSession`.
- **Strict User & Tenant Isolation:** User B logging in on the same device operates under `@apnasamaj:chat:outbox:${tenantSlug}:${userB.id}` and cannot see or dispatch User A's pending outbox messages. When User A logs back in, their pending messages are recovered and dispatched with their authentic credentials.

#### 2. SecureStore Two-Phase Chunking & Cleanups:
- **Two-Phase Commit:** Slices are written to storage first; the count header `${baseKey}:chk_cnt` is updated second as an atomic commit pointer.
- **Corrupted Record Rejection:** `readChunkedItem` verifies that every chunk from `0` to `count - 1` is non-null and that `count` is a valid integer ($1 \le \text{count} \le 500$). Any incomplete or corrupted item returns `null` safely.
- **Obsolete Chunk Cleanup:** When overwriting a larger chunked item with fewer chunks, obsolete chunks from `newChunkCount` up to `oldChunkCount` are explicitly removed. When overwriting with a single unchunked item ($\le 1024$ bytes), all previous chunks and the header are deleted.

#### 3. Web Storage Security Hardening:
- **Attachment Sanitization:** Both `savePendingMessage` and `saveReceivedMessages` sanitize attachment objects, stripping out `url` so that time-limited signed URLs with JWT tokens are NEVER persisted in `localStorage` or `SecureStore`.
- **Audit Findings:** Confirmed that `localStorage` stores only display metadata (content, file names, MIME types, storage paths, delivery status). Sensitive authentication tokens (passwords, JWT secrets) are excluded from chat caches.

#### 4. Backend Attachment Idempotency Fast-Path:
- In [`chat.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/chat.service.ts) and [`direct-chat.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/direct-chat.service.ts), the idempotency lookup for `[conversationId/groupId, senderId, clientMessageId]` executes *before* checking attachment path uniqueness. Client retries with the same `tempId` and attachment return the existing record cleanly without triggering attachment reuse rejection.

#### 5. Active Context Guard & Timer Teardown:
- `outbox-queue.service.ts` tracks all retry timers in `retryTimers: Set<NodeJS.Timeout>` and clears them in `teardown()`.
- Added strict context validation in `processConversationQueue`: verifies `msg.tenantSlug === this.activeTenantSlug && msg.userId === this.activeUserId` before dispatching each item, guaranteeing no cross-tenant message transmission.

---

### C. Hardening Test Results

1. **Mobile Test Suite ([`offline-chat-sync-flow.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/tests/offline-chat-sync-flow.test.ts)):**
   - Incomplete write with missing chunk rejected cleanly: ✅ PASS
   - Corrupted count header safely rejected without crash: ✅ PASS
   - Obsolete chunks cleaned up on record shrink: ✅ PASS
   - All chunks and header cleaned up on unchunked overwrite: ✅ PASS
   - Signed URL stripped from persistent storage: ✅ PASS
   - In-memory session cleanly evicted on logout/switch: ✅ PASS
   - Tenant A message NEVER dispatched with Tenant B credentials: ✅ PASS
   - User 2 cannot see or dispatch User 1 pending messages: ✅ PASS
   - Preserved outbox message recovered when User 1 returns to Tenant A: ✅ PASS
   - **Total Mobile Suite:** **31 / 31 PASSED (100%)**

2. **Backend Idempotency Test Suite ([`chat-idempotency.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/chat-idempotency.test.ts)):**
   - Attachment message created initially: ✅ PASS
   - Retried attachment message returns identical ID without error: ✅ PASS
   - Reusing existing attachment for different message rejected with 400: ✅ PASS
   - **Total Backend Idempotency Suite:** **20 / 20 PASSED (100%)**

3. **Backend Regression Verification:**
   - Direct messaging flow: **41 / 41 PASSED**
   - Chat media attachments: **29 / 29 PASSED**
   - FCM push notifications: **51 / 51 PASSED**

---

### D. Remaining Limitations
- Native physical iPhone testing and macOS Xcode compilation are constrained by the Windows development environment.

---

## 7. Next Recommended Batch

**Batch 8.7: Mobile Chat Voice Notes & Audio Messaging**  
*or*  
**Batch 8.6 Git Synchronization:** Staging, committing, and pushing the verified Batch 8.6 & 8.6.1 changes to `origin main`.

