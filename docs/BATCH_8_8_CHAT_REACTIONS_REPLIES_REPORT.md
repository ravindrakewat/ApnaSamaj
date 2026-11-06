# Apna Samaj — Batch 8.8: Chat Message Reactions, Replies & Quoted Messages Report

- **Batch Identifier:** Batch 8.8 (Mobile Track)
- **Date:** November 6, 2026
- **Status:** ✅ Completed & Fully Verified (Working Tree Preserved for User Audit)
- **Branch:** `main` (base commit: `b534e5aecbece9bab8a2f805da5e845151fff1ca`)
- **Workspaces Involved:** `apps/mobile`, `apps/api`, `packages/database`, `packages/shared-types`, `packages/validation`

---

## 1. Executive Summary

Batch 8.8 implements a WhatsApp-style **Emoji Message Reactions, Swipe-to-Reply, Quoted Message Preview, and Tap-to-Scroll Reply Navigation** system across both **Personal One-to-One Chat** and **Community Group Chat** in Apna Samaj.

Built to deliver modern, intuitive messaging ergonomics, users can react to messages using standard emojis, quote specific messages when replying, immediately identify conversational context with rich media previews, and jump straight to referenced messages in deep chat histories.

### Key Architectural Highlights:
1. **WhatsApp-Standard Reaction Set:** Supported emojis strictly restricted to `['👍', '❤️', '😂', '😮', '😢', '🙏']`.
2. **Strict Single-Reaction Invariant:** Each user can have at most one active reaction per message, enforced at the database level via composite unique indexes (`@@unique([messageId, userId])`).
3. **Toggle Off & Switch Behavior:** Tapping an existing active reaction removes it (toggles off); selecting a different emoji updates the reaction seamlessly without incrementing duplicate user counts.
4. **Quoted Reply Message Model:** Self-referencing foreign key (`replyToMessageId`) on both `ChatMessage` and `DirectMessage` models with `onDelete: SetNull`.
5. **Deleted Parent Graceful Fallback:** If an original message is deleted, replies persist safely, rendering a localized placeholder: *"This message was deleted"*.
6. **Cross-Conversation Boundary Protection:** The backend strictly verifies that `replyToMessageId` belongs to the exact same group (`groupId`) or direct conversation (`conversationId`). Cross-group or cross-tenant references are rejected with HTTP 400.
7. **Pinned Reply Composer Bar:** Displays the sender name and a truncated text or media snippet (photo, video, audio voice note, document) directly above the text input with a one-tap cancel button (`✕`).
8. **Interactive Reply Navigation:** Tapping the quoted preview inside any bubble scrolls the FlatList directly to the referenced message.
9. **Real-time Socket.IO Broadcasts:** Dedicated events `chat:react` / `chat:reaction` and `direct:react` / `direct:reaction` broadcast instant reactions to all online room participants.
10. **Offline Outbox & Local Storage Integration:** Message replies sent offline preserve their `replyToMessageId` and quoted snippet in the local SQLite/SecureStore outbox queue, persisting safely across application restarts and cleanly dispatching when connectivity restores.

---

## 2. Architecture & File Breakdown

### Phase 1 & 6: Database, Validation & Shared Types

#### 1. Prisma Schema & Migration SQL Artifact
- Updated [`packages/database/prisma/schema.prisma`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/schema.prisma):
  - **ChatMessage Model:**
    ```prisma
    model ChatMessage {
      // ... existing fields
      replyToMessageId String?
      replyTo          ChatMessage?          @relation("ChatMessageReplies", fields: [replyToMessageId], references: [id], onDelete: SetNull)
      replies          ChatMessage[]         @relation("ChatMessageReplies")
      reactions        ChatMessageReaction[]
    }
    ```
  - **DirectMessage Model:**
    ```prisma
    model DirectMessage {
      // ... existing fields
      replyToMessageId String?
      replyTo          DirectMessage?          @relation("DirectMessageReplies", fields: [replyToMessageId], references: [id], onDelete: SetNull)
      replies          DirectMessage[]         @relation("DirectMessageReplies")
      reactions        DirectMessageReaction[]
    }
    ```
  - **Reaction Models:**
    ```prisma
    model ChatMessageReaction {
      id        String      @id @default(uuid())
      messageId String
      message   ChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
      userId    String
      user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
      emoji     String
      createdAt DateTime    @default(now())

      @@unique([messageId, userId])
      @@index([messageId])
      @@index([userId])
    }

    model DirectMessageReaction {
      id        String        @id @default(uuid())
      messageId String
      message   DirectMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
      userId    String
      user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
      emoji     String
      createdAt DateTime      @default(now())

      @@unique([messageId, userId])
      @@index([messageId])
      @@index([userId])
    }
    ```
- Generated migration SQL artifact:
  [`packages/database/prisma/migrations/20261106170000_add_chat_reactions_and_replies/migration.sql`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/migrations/20261106170000_add_chat_reactions_and_replies/migration.sql)
  *(Strict monorepo rule observed: Migration SQL artifact generated only; no database migrations executed against live databases).*
- Regenerated Prisma Client via `npm run db:generate`.

#### 2. Shared Types & Zod Validation
- Updated [`packages/shared-types/src/chat.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/shared-types/src/chat.ts):
  - Defined `ALLOWED_CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const`.
  - Defined `ChatReactionSummary`: `{ emoji: string; count: number; users: { id: string; name: string }[]; hasReacted: boolean }`.
  - Defined `ChatMessageReplyPreview`: `{ id: string; senderId: string; senderName: string; content?: string; mediaType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO'; isDeleted?: boolean }`.
  - Expanded `ChatMessageItem` and `DirectMessageItem` with `replyToMessageId?: string | null`, `replyTo?: ChatMessageReplyPreview | null`, and `reactions: ChatReactionSummary[]`.
  - Expanded `SendChatMessageInput` and `SendDirectMessageInput` with `replyToMessageId?: string`.
  - Added `ToggleChatReactionInput`, `ToggleChatReactionResponseData`, and `ChatReactionEventPayload`.
- Updated [`packages/validation/src/chat.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/validation/src/chat.ts):
  - Added `ALLOWED_CHAT_REACTIONS`.
  - Added `toggleChatReactionSchema`: verifies `emoji` is in `ALLOWED_CHAT_REACTIONS`.
  - Added optional `replyToMessageId: z.string().uuid().optional()` to `sendChatMessageSchema` and `sendDirectMessageSchema`.

---

### Phase 2: Backend API Services & Controllers

#### 1. Group Chat Service & Controller
- Updated [`apps/api/src/modules/chat/chat.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/chat.service.ts):
  - `aggregateReactions(reactions, currentUserId)`: Groups reactions by emoji, calculates counts, formats user rosters, and sets `hasReacted`.
  - `chatMessageInclude`: Joins `replyTo` (author, attachments) and `reactions` (user).
  - `mapToChatMessageItem`: Constructs `ChatMessageReplyPreview` with deleted parent fallback: `senderName: 'Original Message'`, `content: 'This message was deleted'`.
  - `sendChatMessage`: Validates `replyToMessageId` exists in the exact same `groupId`. Throws `400 Bad Request` on cross-group replies.
  - `toggleChatMessageReaction`: Checks existing reaction for `(messageId, userId)`. If emoji matches, deletes reaction (`action: 'removed'`). If different or non-existent, upserts reaction (`action: 'added' | 'updated'`).
  - `removeChatMessageReaction`: Explicitly deletes reaction for `(messageId, userId)`.
- Updated [`apps/api/src/modules/chat/chat.controller.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/chat.controller.ts):
  - `toggleGroupMessageReactionHandler`: Validates body with `toggleChatReactionSchema` and calls `toggleChatMessageReaction`.
  - `removeGroupMessageReactionHandler`: Deletes reaction for group message.
- Updated [`apps/api/src/modules/groups/groups.routes.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/groups/groups.routes.ts):
  - `POST /api/v1/groups/:id/messages/:messageId/reactions` -> `toggleGroupMessageReactionHandler`
  - `DELETE /api/v1/groups/:id/messages/:messageId/reactions` -> `removeGroupMessageReactionHandler`

#### 2. Direct Chat Service & Controller
- Updated [`apps/api/src/modules/chat/direct-chat.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/direct-chat.service.ts):
  - `directMessageInclude`: Includes `replyTo` and `reactions`.
  - `mapToDirectMessageItem`: Constructs `ChatMessageReplyPreview` with safe fallbacks and reaction aggregation.
  - `sendDirectMessage`: Validates `replyToMessageId` belongs to the current `conversationId`.
  - `toggleDirectMessageReaction`: Confirms user is participant of the direct conversation, then toggles reaction with single-reaction invariant.
  - `removeDirectMessageReaction`: Explicitly deletes reaction.
- Updated [`apps/api/src/modules/chat/direct-chat.controller.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/direct-chat.controller.ts):
  - `toggleDirectMessageReactionHandler` and `removeDirectMessageReactionHandler`.
- Updated [`apps/api/src/modules/chat/chat.routes.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/chat.routes.ts):
  - `POST /api/v1/chat/conversations/:id/messages/:messageId/reactions` -> `toggleDirectMessageReactionHandler`
  - `DELETE /api/v1/chat/conversations/:id/messages/:messageId/reactions` -> `removeDirectMessageReactionHandler`

#### 3. Real-time Socket.IO Gateways
- Updated [`apps/api/src/modules/chat/chat.socket.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/chat/chat.socket.ts):
  - Added `chat:react` listener: calls `toggleChatMessageReaction` and broadcasts `chat:reaction` event to group room.
  - Added `direct:react` listener: calls `toggleDirectMessageReaction` and broadcasts `direct:reaction` event to direct conversation room.
  - Updated `send_message` and `direct:send_message` handlers to accept and persist `replyToMessageId`.

---

### Phase 3, 4 & 5: Mobile UI Components, Hooks & Persistence

#### 1. UI Components
- Created [`apps/mobile/src/components/chat/EmojiReactionSelector.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/components/chat/EmojiReactionSelector.tsx):
  - Floating pill overlay modal displaying standard 6 emojis (`👍`, `❤️`, `😂`, `😮`, `😢`, `🙏`).
  - Highlights currently selected reaction.
  - Supports tapping backdrop to dismiss.
- Created [`apps/mobile/src/components/chat/ReactionBadgeList.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/components/chat/ReactionBadgeList.tsx):
  - Horizontal chip row rendered underneath chat bubbles.
  - Displays emoji and count badge (e.g. `👍 3`, `❤️ 1`).
  - Active chip is highlighted with primary brand accent; tapping directly toggles the reaction.
- Created [`apps/mobile/src/components/chat/QuotedReplyPreview.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/components/chat/QuotedReplyPreview.tsx):
  - Embedded snippet inside message bubbles with vertical colored accent border.
  - Renders sender name and preview text or media icon (`📷 Photo`, `🎥 Video`, `🎤 Voice message`, `📄 Document`).
  - Tapping invokes `onPressReply` to scroll the list directly to the original message.
- Created [`apps/mobile/src/components/chat/ReplyComposerBar.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/components/chat/ReplyComposerBar.tsx):
  - Pinned banner directly above the chat composer input when replying.
  - Displays `"Replying to [Sender]"` and message snippet with a dismiss icon button (`✕`).
- Exported components via [`apps/mobile/src/components/chat/index.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/components/chat/index.ts).

#### 2. Mobile API & Offline Services
- Updated [`apps/mobile/src/api/chat.api.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/api/chat.api.ts):
  - `toggleGroupReaction(groupId, messageId, emoji)`
  - `removeGroupReaction(groupId, messageId)`
  - `toggleDirectReaction(conversationId, messageId, emoji)`
  - `removeDirectReaction(conversationId, messageId)`
  - Added `replyToMessageId` parameter to `sendGroupMessage` and `sendDirectMessage`.
- Updated [`apps/mobile/src/services/chat-persistence.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/services/chat-persistence.service.ts):
  - Stored `replyToMessageId`, `replyTo`, and `reactions` on cached messages.
  - Implemented `updateMessageReactions(tenantSlug, conversationKey, messageId, reactions)` for in-memory and persistent cache updates without full list refreshes.
- Updated [`apps/mobile/src/services/outbox-queue.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/services/outbox-queue.service.ts):
  - Preserved `replyToMessageId` and `replyTo` in queued outbox items.
  - Forwarded `replyToMessageId` during background dispatch to `chatApi.sendDirectMessage` / `chatApi.sendGroupMessage`.

#### 3. Hooks & Screen Integration
- Updated [`apps/mobile/src/hooks/useGroupChat.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/hooks/useGroupChat.ts):
  - Added `replyingToMessage` state and `setReplyingToMessage`.
  - Added `toggleReaction(messageId, emoji)` with optimistic local update and API/Socket sync.
  - Subscribed to `chat:reaction` socket event to dynamically update reactions across all group members.
- Updated [`apps/mobile/src/hooks/useDirectChat.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/hooks/useDirectChat.ts):
  - Added `replyingToMessage` state and `setReplyingToMessage`.
  - Added `toggleReaction(messageId, emoji)` with optimistic local update and API/Socket sync.
  - Subscribed to `direct:reaction` socket event.
- Updated [`apps/mobile/app/(app)/group/[slug]/chat.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/app/(app)/group/[slug]/chat.tsx) and [`apps/mobile/app/(app)/chat/[id].tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/app/(app)/chat/[id].tsx):
  - Integrated `flatListRef` with `scrollToIndex` for animated jump-to-message navigation.
  - Long press message bubble opens `EmojiReactionSelector` and offers option to reply.
  - Embedded `QuotedReplyPreview` inside bubbles and `ReactionBadgeList` directly below bubbles.
  - Rendered `ReplyComposerBar` above composer bar when `replyingToMessage` is active.

---

## 3. Verification & Test Results

### 1. Backend Integration Tests
Executed [`apps/api/src/tests/chat-reactions-replies-backend.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/chat-reactions-replies-backend.test.ts):
```
================================================================
   Apna Samaj — Batch 8.8: Chat Reactions & Replies Backend Tests
================================================================

--- 1. Allowed Emojis Invariants ---
✅ PASS: Allowed reaction emoji set contains exact standard 6 emojis

--- 2. Group Chat Reactions Lifecycle ---
✅ PASS: Create group chat message to react on
✅ PASS: User 1 adds 👍 reaction (action: added)
✅ PASS: User 1 changes reaction to ❤️ (action: updated, replaces 👍)
✅ PASS: User 2 adds ❤️ reaction (count increases to 2)
✅ PASS: User 3 adds 😂 reaction (two distinct emojis aggregated)
✅ PASS: User 1 taps ❤️ again to toggle off / remove (action: removed)
✅ PASS: Unsupported emoji reaction is rejected with 400
✅ PASS: Explicit remove reaction deletes active reaction

--- 3. Direct Chat Reactions Lifecycle ---
✅ PASS: Send direct message and toggle reaction
✅ PASS: Non-participant user cannot react to direct message (403 Forbidden)

--- 4. Swipe-to-Reply & Quoted Message Previews ---
✅ PASS: Send reply to group message with replyToMessageId
✅ PASS: Send reply to direct message with replyToMessageId

--- 5. Cross-Conversation Reply Rejection ---
✅ PASS: Replying in Group 2 to a message from Group 1 is rejected with 400
✅ PASS: Replying in Direct Conversation to a non-existent or foreign message is rejected with 400

--- 6. Deleted Parent Message Safe Fallback ---
✅ PASS: Deleted original message gracefully falls back to [Message deleted]

--- 7. History Pagination With Replies and Reactions ---
✅ PASS: History query retrieves messages with full reply previews and reactions

--- 8. Batch 8.8.1 Reliability & Security Hardening Tests ---
✅ PASS: Group slug resolution returns canonical groupId in toggle reaction
✅ PASS: Empty or whitespace replyToMessageId is sanitized safely as no reply
✅ PASS: Excessively long replyToMessageId (>100 chars) is rejected with 400
✅ PASS: Concurrent P2002 conflict handling returns valid reaction state without throwing

================================================================
🎉 TEST SUMMARY: 21 passed, 0 failed.
================================================================
```

### 2. Mobile Integration & Flow Tests
Executed [`apps/mobile/src/tests/chat-reactions-replies-flow.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/tests/chat-reactions-replies-flow.test.ts) via mobile test runner:
```
================================================================
   Apna Samaj — Batch 8.8: Chat Reactions & Replies Mobile Suite
================================================================

--- 1. Allowed Reactions Constants ---
✅ PASS: Standard 6 WhatsApp-like reaction emojis

--- 2. Reaction State Aggregation & Toggle Logic ---
✅ PASS: Adding initial reaction sets count = 1 and hasReacted = true
✅ PASS: Switching emoji replaces prior reaction (one reaction per user invariant)
✅ PASS: Tapping same emoji toggles off / removes reaction

--- 3. Local Outbox Queue With Replies ---
✅ PASS: Enqueue message reply with replyToMessageId and replyTo snippet
✅ PASS: Local cache preserves replyTo and reactions across simulated app restart
✅ PASS: Update message reactions in persistence layer

--- 4. Real-time Socket Event Reconciliation ---
✅ PASS: ChatReactionEventPayload format conforms to contract

--- 5. Deleted Original Message Safe Fallback ---
✅ PASS: Deleted message snippet renders safely with fallback text

--- 6. Cross-Tenant Queue Isolation ---
✅ PASS: Tenant B cannot see Tenant A replies or outbox queue

================================================================
🎉 BATCH 8.8 MOBILE TEST SUMMARY: 10 passed, 0 failed.
================================================================
```

### 3. Monorepo Quality Gates
- **Full Mobile Suite Runner:** Passed all 8 mobile batch test suites (foundation, auth, feed, offline outbox, voice notes, and reactions/replies).
- **TypeScript Typecheck (`npm run typecheck`):** Passed with 0 errors across all 10 workspaces (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/mobile`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`, root).
- **Production Build (`npm run build`):** Passed with 0 errors across all workspaces.

---

## 4. Multi-Tenant Architectural Invariants Compliance

1. **Explicit Tenant Context:** Requests require tenant context (`x-community-slug`), and queries execute strictly against the tenant's physical database via `req.db` and `assertDb(req.db)`.
2. **Single-Reaction Constraint:** Enforced via composite unique constraints (`@@unique([messageId, userId])`) on physical tenant tables.
3. **Cross-Group/Cross-Conversation Boundary Enforcement:** Backend checks verify that referenced messages exist within the identical group or direct conversation; foreign ID references are strictly rejected with HTTP 400.
4. **Deleted Parent Handling:** Foreign key relation uses `onDelete: SetNull`; when a parent message is deleted, the reply is preserved and returns a safe fallback placeholder rather than throwing or failing queries.
5. **Zero Live Database Migrations:** Only non-executed migration SQL generated at `packages/database/prisma/migrations/20261106170000_add_chat_reactions_and_replies/migration.sql`.
6. **Zero Secrets Staged or Exposed:** No secrets, credentials, `.env` entries, or API tokens committed or exposed.

---

## 5. Batch 8.8.1: Reliability & Security Audit Summary

A rigorous code-level audit was conducted across reaction persistence, concurrency races, reply cross-boundary validation, Socket.IO room routing, and mobile UI rendering.

### Findings Classified by Severity:

| Severity | Issue | Area | Resolution |
| :--- | :--- | :--- | :--- |
| **High** | Concurrent P2002 Unique Constraint / P2025 conflicts on rapid reaction toggles | Backend (`chat.service.ts`, `direct-chat.service.ts`) | Handled P2002 on `create` by reconciling the concurrent insert (toggling off if identical emoji, updating if different emoji) and handled P2025 on `update`/`delete` gracefully. |
| **Medium** | Socket.IO room mismatch when toggling group reaction with group slug | API & Sockets (`chat.controller.ts`, `chat.socket.ts`) | `toggleChatMessageReaction` returns canonical `groupId: group.id`. Socket emissions now strictly target the canonical UUID room `${tenantSlug}:group:${result.groupId}`. |
| **Medium** | Unsanitized `replyToMessageId` in Socket.IO and service calls | Backend (`chat.service.ts`, `direct-chat.service.ts`) | Whitespace/empty strings sanitized to `undefined`; values exceeding 100 characters rejected with HTTP 400. |
| **Low** | Missing `onScrollToIndexFailed` in mobile FlatList | Mobile screens (`chat/[id].tsx`, `group/[slug]/chat.tsx`) | Added `onScrollToIndexFailed` timeout retry handler to prevent runtime FlatList out-of-range warnings on unrendered virtualized items. |
| **Low** | Interactive tap on deleted parent quote preview | Mobile UI (`QuotedReplyPreview.tsx`) | Disabled `onPress` and set `activeOpacity={1}` when `isDeleted` is true to avoid non-functional jump attempts on deleted messages. |

### Regression Test Suite Results:
- **Batch 8.8 Backend Suite:** 21 / 21 Passed (added 4 audit regression tests)
- **Batch 8.8 Mobile Flow Suite:** 10 / 10 Passed
- **Direct Messaging Flow Suite:** 41 / 41 Passed
- **Voice Notes Backend Suite:** 12 / 12 Passed
- **Chat Idempotency Suite:** 20 / 20 Passed
- **Chat Media Attachments Suite:** 29 / 29 Passed
- **Push Notifications Suite:** 51 / 51 Passed
- **Mobile Test Runner (Batches 1–8.8):** All 8 Batches Passed
- **Monorepo Typecheck:** 0 errors across all 10 workspaces
- **Monorepo Production Build:** 0 errors across all workspaces


