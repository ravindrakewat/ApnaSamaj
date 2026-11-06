# Apna Samaj — Batch 8.9: Chat Message Search & In-Chat Media Gallery Report

## 1. Executive Summary

Batch 8.9 delivers a production-grade WhatsApp-style in-chat message search and media gallery system across both **Personal One-to-One Chat** and **Community Group Chat** on the Apna Samaj mobile application and backend services.

The implementation preserves all architectural invariants:
- Physical multi-tenant database isolation via `assertDb(req.db)`.
- Strict participant authorization on direct conversations (non-participants blocked with 403 Forbidden).
- Strict membership authorization on private community groups (non-members blocked with 403 Forbidden).
- Secure time-bounded signed URLs for all media attachments (raw private storage URLs never exposed).
- Offline-first search over locally cached messages combined with remote server search without duplicate result records.
- Low-memory footprint and smooth virtualized rendering optimized for budget Android hardware.
- Zero unapplied live Prisma migrations (utilizing existing `ChatAttachment` schema and `MediaType` enum).

---

## 2. Implemented Architecture & Features

### Part 1: Chat Message Search
- **Local & Remote Hybrid Search**:
  - `ChatPersistenceService.searchLocalMessages`: Fast case-insensitive substring search across locally cached messages and attachment filenames, tagged with `matchSource: 'local'`.
  - Backend search endpoints: Full text search across conversation messages with cursor pagination, sender filtering, date range filtering, and total matches counter, tagged with `matchSource: 'remote'`.
  - Unified result deduplication merging local cache results and remote server results without duplicate message records.
- **Debounced Interactive UI**:
  - `ChatSearchBar`: Top collapsible search header with 300ms input debounce, clear button (`✕`), match counter pill (`1/4` or `0 matches`), and stepping navigation arrows (↑ / ↓) to step through matched messages directly in the chat view.
  - `ChatSearchResultsModal`: Comprehensive search results sheet featuring matched keyword highlighting, sender avatar, formatted relative timestamp, media attachment badges (`📷 Photo`, `🎥 Video`, `🎵 Voice Note`, `📄 Document`), and data source indicators (`⚡ Cached` vs `☁️ Server`).
- **Jump Navigation to Original Message**:
  - Tapping a search result smoothly closes the search modal and navigates to the target message.
  - If the target message is already within the in-memory window, `FlatList.scrollToIndex` scrolls directly to it.
  - If the target message is older and not loaded in memory, `getGroupMessageContext` / `getDirectMessageContext` fetches the message and surrounding context, merges them into the conversation state maintaining descending chronological order, and scrolls to the message with timeout resilience against `onScrollToIndexFailed`.

### Part 2: In-Chat Media Gallery
- **Dedicated Media Browser (`ChatMediaGalleryModal`)**:
  - Accessible via header action button (🖼️) in both Personal Chat (`chat/[id].tsx`) and Group Chat (`group/[slug]/chat.tsx`).
  - 4 Segmented Filter Tabs:
    1. 📸 **Photos** (`IMAGE`): 3-column responsive photo grid with thumbnail preview, file size, tap-to-expand full-screen image viewer with pinch/zoom support.
    2. 🎥 **Videos** (`VIDEO`): 3-column video grid with video icon placeholder, duration badge, file size, and external viewer trigger.
    3. 🎵 **Audio / Voice Notes** (`AUDIO`): Dedicated audio cards with waveform icon, duration formatting (`0:42`), file size, sender name, and inline audio playback toggle via `voicePlaybackService` respecting the single-player lock.
    4. 📄 **Documents** (`DOCUMENT`): Document cards with extension badges (`PDF`, `DOCX`, `XLSX`), formatted size, sender details, and tap-to-open document action.
- **Date-Based Browsing**:
  - Media grouped chronologically ("This Month", "October 2026", "Older").
- **Direct Navigation to Message**:
  - Every media item in the gallery includes a "Go to msg" action button that dismisses the gallery and scrolls the main chat FlatList directly to the message where the attachment was shared.

### Part 3: Backend Services & API Endpoints

| Method | Endpoint | Description | Authorization & Guards |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/groups/:id/chat/search` | Search community group chat messages | Active tenant user; non-members blocked from private groups (403) |
| `GET` | `/api/v1/groups/:id/chat/media` | Retrieve paginated group media gallery | Active tenant user; non-members blocked from private groups (403); signed URLs generated |
| `GET` | `/api/v1/groups/:id/chat/messages/:messageId/context` | Fetch context messages around target group message | Active tenant user; non-members blocked from private groups (403) |
| `GET` | `/api/v1/chat/conversations/:id/search` | Search personal direct messages | Direct conversation participants only (userOne / userTwo); outsiders blocked (403) |
| `GET` | `/api/v1/chat/conversations/:id/media` | Retrieve paginated direct media gallery | Direct conversation participants only; outsiders blocked (403); signed URLs generated |
| `GET` | `/api/v1/chat/conversations/:id/messages/:messageId/context` | Fetch context messages around target direct message | Direct conversation participants only; outsiders blocked (403) |

---

## 3. Security, Multi-Tenancy & Authorization Invariants

1. **Physical Tenant Isolation**:
   All database queries execute through `req.db` and are strictly guarded with `assertDb(req.db)`. Requests lacking tenant context fail closed with HTTP 400.
2. **Private Group Protection**:
   Search and media gallery queries in private groups verify active membership in `groupMember`. Unauthorized users are strictly rejected with HTTP 403 Forbidden.
3. **Personal Chat Isolation**:
   Direct message search and media gallery queries verify that `req.user.id` is either `userOneId` or `userTwoId` of the conversation. Unauthorized community members are rejected with HTTP 403 Forbidden.
4. **Temporary Signed URLs**:
   Media URLs returned by `/chat/media` are generated dynamically using `createTemporarySignedChatAttachmentUrl` with a 3600-second expiration. Raw private Supabase storage paths are never exposed.
5. **Client Local Storage Segregation**:
   Cached messages in `ChatPersistenceService` are strictly isolated by `tenantSlug` and `userId`. Switching accounts or tenants cannot expose another user's cached chat history or media.

---

## 4. Verification & Test Results

### Backend Test Suite (`apps/api/src/tests/chat-search-media-backend.test.ts`)
19 integration test cases verifying:
- Group chat text search (case-insensitive substring).
- Group chat attachment filename search.
- Group chat sender filter and date range filter.
- Private group search rejection for non-members (403 Forbidden).
- Group media gallery signed URL generation and type filtering (`IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`).
- Direct chat text search and participant authorization (outsider 403 Forbidden).
- Direct chat media gallery signed URL generation.
- Message context retrieval (`getGroupMessageContext` and `getDirectMessageContext`) returning accurate `targetIndex`.
- Multi-tenant isolation and `assertDb` enforcement.

**Result: 19/19 PASSED (0 failures)**

### Mobile Test Runner (`apps/mobile/src/tests/test-runner.ts`)
Full mobile test runner executing 9 suites:
- Batch 1 Foundation: 22 passed.
- Batch 2 Auth & Session: 17 passed.
- Batch 2.1 Auth Verification: 5 passed.
- Batch 8.2 Direct Messaging: 41 passed.
- Batch 8.4 Media Attachments: 29 passed.
- Batch 8.5 FCM Push Notifications: 51 passed.
- Batch 8.6 Offline Chat Sync & Outbox Queue: 31 passed.
- Batch 8.7 Voice Notes & Audio Messaging: 16 passed.
- Batch 8.8 Chat Reactions & Replies: 10 passed.
- Batch 8.9 Chat Search & Media Gallery: 9 passed.

**Result: ALL PASSED (0 failures across all mobile suites)**

### Monorepo Typecheck & Build
- `npm run typecheck`: Passed with **0 errors** across all 10 workspaces (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/mobile`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`, root).
- `npm run build`: Production builds passed cleanly for web, admin, and backend.

---

## 5. Modified & Created Files

| File | Action | Description |
| :--- | :--- | :--- |
| `packages/shared-types/src/chat.ts` | Modified | Added types for search query, search results, media gallery items, and message context. |
| `packages/validation/src/chat.ts` | Modified | Added Zod validation schemas: `chatSearchQuerySchema`, `chatMediaQuerySchema`, `chatMessageContextParamSchema`. |
| `apps/api/src/modules/chat/chat.service.ts` | Modified | Implemented `searchGroupMessages`, `getGroupMediaGallery`, `getGroupMessageContext`. |
| `apps/api/src/modules/chat/chat.controller.ts` | Modified | Implemented `searchGroupMessagesHandler`, `getGroupMediaGalleryHandler`, `getGroupMessageContextHandler`. |
| `apps/api/src/modules/chat/direct-chat.service.ts` | Modified | Implemented `searchDirectMessages`, `getDirectMediaGallery`, `getDirectMessageContext`. |
| `apps/api/src/modules/chat/direct-chat.controller.ts` | Modified | Implemented `searchDirectMessagesHandler`, `getDirectMediaGalleryHandler`, `getDirectMessageContextHandler`. |
| `apps/api/src/modules/groups/groups.routes.ts` | Modified | Mounted group search, media gallery, and context routes. |
| `apps/api/src/modules/chat/chat.routes.ts` | Modified | Mounted direct search, media gallery, and context routes. |
| `apps/api/src/tests/chat-search-media-backend.test.ts` | Created | 19 integration tests for backend search, media gallery, and context endpoints. |
| `apps/mobile/src/api/chat.api.ts` | Modified | Added client methods for search, media gallery, and message context. |
| `apps/mobile/src/services/chat-persistence.service.ts` | Modified | Added `searchLocalMessages` and reinforced user-scoped cache isolation. |
| `apps/mobile/src/components/chat/ChatSearchBar.tsx` | Created | WhatsApp-style collapsible search bar with 300ms debounce and match steppers. |
| `apps/mobile/src/components/chat/ChatSearchResultsModal.tsx` | Created | Search results sheet with keyword highlighting and source badges (`⚡ Cached` / `☁️ Server`). |
| `apps/mobile/src/components/chat/ChatMediaGalleryModal.tsx` | Created | In-chat media browser with Photos, Videos, Audio, and Docs tabs, date grouping, and "Go to msg" action. |
| `apps/mobile/src/components/chat/index.ts` | Modified | Exported new search and gallery components. |
| `apps/mobile/src/hooks/useDirectChat.ts` | Modified | Added `jumpToMessage` with context fetching and descending sort preservation. |
| `apps/mobile/src/hooks/useGroupChat.ts` | Modified | Added `jumpToMessage` with context fetching and descending sort preservation. |
| `apps/mobile/app/(app)/chat/[id].tsx` | Modified | Integrated search bar, search results modal, media gallery modal, and header action buttons. |
| `apps/mobile/app/(app)/group/[slug]/chat.tsx` | Modified | Integrated search bar, search results modal, media gallery modal, and header action buttons. |
| `apps/mobile/src/tests/chat-search-media-flow.test.ts` | Created | Mobile unit and flow tests for search, deduplication, gallery filtering, and jump navigation. |
| `apps/mobile/src/tests/test-runner.ts` | Modified | Registered Batch 8.9 test suite into mobile runner. |
| `docs/BATCH_8_9_CHAT_SEARCH_MEDIA_GALLERY_REPORT.md` | Created | Batch 8.9 engineering, architecture, and verification report. |
| `docs/PROJECT_HISTORY.md` | Modified | Updated Section E and Section F with Batch 8.9 entry. |
| `docs/MOBILE_APP_DEVELOPMENT_DASHBOARD.md` | Modified | Updated mobile chat subsystem roadmap and milestone status. |

---

## 6. Remaining Limitations & Next Steps

1. **Full-Text Database Indexes**:
   Currently, search uses PostgreSQL `ILIKE` (`contains` with `mode: 'insensitive'`). For high-volume enterprise deployments with millions of messages per tenant, PostgreSQL `tsvector` / GIN indexes on `ChatMessage.content` and `DirectMessage.content` can be provisioned in a future optimization batch.
2. **Next Scheduled Batch**:
   - **Batch 8.10 (Mobile Track)**: Chat Message Deletion & Moderation ("Delete for Me", "Delete for Everyone" within time window, and Group Admin Message Deletion).

