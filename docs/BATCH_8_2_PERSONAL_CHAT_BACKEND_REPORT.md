# Batch 8.2 — Personal One-to-One Messaging Backend Report

## 1. Executive Summary

- **Batch Name:** Batch 8.2 — Personal One-to-One Messaging Backend
- **Objective:** Design and implement the complete backend architecture for private one-to-one messaging in Apna Samaj, supporting 1-on-1 conversations, cursor-paginated chat history, real-time Socket.IO events, unified inbox with unread counts, and read status marking without disturbing existing Community Group Chat or running database mutations.
- **Status:** **COMPLETE & VERIFIED**
- **Test Suite Pass Rate:** **41 / 41 (100%)** Direct Messaging flow assertions passed; **47 / 47 (100%)** Phase 15C.4 Chat Isolation tests passed; **163 / 163 (100%)** Mobile app tests passed.
- **Monorepo Typecheck:** **0 errors** across all 9 workspaces (`admin`, `api`, `mobile`, `web`, `database`, `i18n`, `shared-types`, `ui-config`, `validation`).

---

## 2. Phase 1: Database Architecture

### A. Prisma Models Designed
Added three dedicated models in `packages/database/prisma/schema.prisma` under the tenant database schema:

1. **`DirectConversation`**
   - Fields: `id`, `userOneId`, `userTwoId`, `createdAt`, `updatedAt`
   - Constraints & Indexes:
     - `@@unique([userOneId, userTwoId])`: Physical database uniqueness preventing race-condition duplicate reciprocal conversations between any two users.
     - `@@index([userOneId])`, `@@index([userTwoId])`, `@@index([updatedAt(sort: Desc)])` for fast inbox ordering.
   - Relations: `userOne` (`User`), `userTwo` (`User`), `participants` (`DirectConversationParticipant[]`), `messages` (`DirectMessage[]`). Cascade deletion on user deletion.

2. **`DirectConversationParticipant`**
   - Fields: `id`, `conversationId`, `userId`, `lastReadAt`, `createdAt`, `updatedAt`
   - Constraints & Indexes:
     - `@@unique([conversationId, userId])`: Strictly enforces 1 participant record per user per conversation.
     - `@@index([userId])`, `@@index([conversationId])`.
   - Purpose: Per-user read tracking (`lastReadAt`) to power inbox unread counts and read receipts independently.

3. **`DirectMessage`**
   - Fields: `id`, `conversationId`, `senderId`, `content`, `createdAt`, `updatedAt`
   - Constraints & Indexes:
     - `@@index([conversationId, createdAt(sort: Desc)])` for fast cursor-paginated message history.
     - `@@index([senderId])`.
   - Relations: `conversation` (`DirectConversation`), `sender` (`User`).

4. **`User` Model Relations Updated**
   - Added: `directConversationsAsUserOne`, `directConversationsAsUserTwo`, `directChatParticipations`, `sentDirectMessages`.

### B. Migration Artifact
- Created migration SQL artifact at:
  `packages/database/prisma/migrations/20261104203000_add_direct_messaging/migration.sql`
- **Strict Compliance:** In accordance with user rules, `prisma migrate dev` or `prisma migrate deploy` was **NOT** executed; no live or dev databases were mutated. Types were updated strictly via `npx prisma generate`.

---

## 3. Phase 2: Shared Types & Validation Schemas

### A. Shared Types (`packages/shared-types/src/chat.ts`)
- `DirectChatParticipant`: Safe public display information (`id`, `fullName`, `avatarUrl`, `lastReadAt`).
- `DirectMessageItem`: Standard representation of 1-to-1 messages across backend, socket, and frontend.
- `PaginatedDirectMessagesResponse` / `DirectMessagesResponseData`: Paginated message list with `nextCursor` and `hasMore`.
- `DirectConversationItem`: Inbox conversation summary with `otherUser`, `lastMessage`, and `unreadCount`.
- `DirectInboxResponseData`: Inbox list with cursor pagination.
- `CreateDirectConversationInput`: Input payload (`recipientId`).
- `SendDirectMessageInput`: Message send payload (`content`, `tempId`).
- `DirectNewMessageEvent`: Real-time WebSocket event payload for new messages.
- `DirectUserTypingEvent`: Real-time WebSocket typing status event.
- `DirectMessageReadEvent`: Real-time WebSocket read receipt event.

### B. Validation Schemas (`packages/validation/src/chat.ts`)
- `createDirectConversationSchema`: Zod schema validating `recipientId` (UUID).
- `sendDirectMessageSchema`: Validates `content` (1–2000 chars trimmed) and optional `tempId`.
- `listDirectMessagesQuerySchema`: Validates pagination parameters (`before`, `limit` 1–50, default 20).
- `listDirectInboxQuerySchema`: Validates inbox cursor pagination (`cursor`, `limit` 1–50, default 20).

---

## 4. Phase 3: REST API Service, Controller, and Routes

Mounted at `/api/v1/chat` with middleware pipeline: `authenticateToken`, `requireActiveUser`, `requireTenantContext`.

| Method | Endpoint | Handler | Description | Security & Authorization |
|---|---|---|---|---|
| `GET` | `/api/v1/chat/inbox` | `getDirectInboxHandler` | Retrieves cursor-paginated inbox list with unread counts and last message previews | Tenant-isolated; restricted to active user's conversations |
| `POST` | `/api/v1/chat/direct` | `createDirectConversationHandler` | Starts or fetches an existing 1-on-1 direct conversation with another member | Verifies recipient exists and is `ACTIVE`; orders user IDs lexicographically (`userA < userB ? [A, B] : [B, A]`); handles `P2002` race conditions |
| `GET` | `/api/v1/chat/conversations/:id/messages` | `getDirectMessagesHandler` | Cursor-paginated message history for a direct conversation | Rejects non-participants with `403 Forbidden` |
| `POST` | `/api/v1/chat/conversations/:id/messages` | `sendDirectMessageHandler` | Sends a message in a conversation and broadcasts over WebSocket | Enforces participant check, updates `DirectConversation.updatedAt` and sender's `lastReadAt` |
| `POST` | `/api/v1/chat/conversations/:id/read` | `markDirectConversationReadHandler` | Marks direct conversation as read up to current timestamp | Updates `DirectConversationParticipant.lastReadAt` and emits `direct:message_read` |

---

## 5. Phase 4: Socket.IO Real-Time Messaging

Updated `apps/api/src/modules/chat/chat.socket.ts`:
- **Room Naming Convention:** `${tenantSlug}:conversation:${conversationId}` via `getConversationRoomName(tenantSlug, conversationId)`.
- **Supported Events:**
  1. `direct:join`: Authorizes user against tenant database before joining the conversation room. Rejects non-participants.
  2. `direct:leave`: Leaves conversation room cleanly.
  3. `direct:send_message`: Applies in-memory rate limiting (~1 msg/sec), persists message via `sendDirectMessage`, broadcasts `direct:new_message` to room, acknowledges sender callback with database record.
  4. `direct:user_typing`: Authorizes participant and broadcasts typing indicator to other room members (`direct:user_typing`).
  5. `direct:message_read`: Persists read timestamp via `markDirectConversationAsRead` and broadcasts `direct:message_read` event to room for instant blue-tick/read status display.

---

## 6. Phase 5: Verification & Test Results

### A. Dedicated Direct Messaging Test Suite (`apps/api/src/tests/direct-messaging-flow.test.ts`)
Executed with `npx tsx`:
- **Scenario 1: Creating a direct conversation:** Verified creation, `otherUser` mapping, profile info, and initial `unreadCount = 0`.
- **Scenario 2: Duplicate conversation prevention:** Verified order-independent reciprocal request (`B -> A`) returns identical conversation ID; self-chat rejected (`400`); suspended/inactive member chat rejected (`404`).
- **Scenario 3: Sending direct messages:** Verified message persistence, sender profile inclusion, content integrity.
- **Scenario 4: Message history pagination:** Verified `limit: 3`, `hasMore: true`, `nextCursor` resolution, and subsequent page retrieval.
- **Scenario 5: Inbox last-message preview:** Verified conversation ordering by `updatedAt: desc` and accurate last message preview.
- **Scenario 6: Unread count calculation:** Verified recipient unread count accurately calculates pending unread messages from sender.
- **Scenario 7: Read status marking:** Verified `markDirectConversationAsRead` updates `lastReadAt`, drops unread count to 0, and updates subsequent replies.
- **Scenario 8: Unauthorized conversation access rejection:** Verified third-party User C is blocked from accessing conversation details (`403 Forbidden`), fetching message history (`403`), or sending messages (`403`).
- **Scenario 9: Cross-tenant isolation:** Verified conversations from Tenant 1 do not exist in Tenant 2 (`404`); Tenant 2 inbox remains completely empty.
- **Scenario 10: Socket room authorization:** Verified tenant-prefixed room naming (`kewat:conversation:id`).
- **Scenario 11: Idempotency & tempId handling:** Verified client-supplied `tempId` passed through for optimistic UI reconciliation.
- **Scenario 12: Group Chat regression test:** Verified existing Community Group Chat (`verifyGroupChatAccess`, `sendChatMessage`, `getGroupChatHistory`) works identically and without regression.
- **Result:** **41 / 41 assertions passed (100%)**.

### B. Regression Test Suites
1. `npx tsx apps/api/src/tests/notifications-chat-tenant.test.ts`: **47 / 47 passed (100%)**.
2. `npx tsx apps/mobile/src/tests/test-runner.ts`: **163 / 163 passed (100%)**.
3. Monorepo Typecheck (`npm run typecheck` across all 9 workspaces): **0 errors (100%)**.

---

## 7. Next Recommended Batch

- **Batch 8.3: Mobile Personal One-to-One Chat UI:**
  - Build Member Profile → "Message" button entry point.
  - Build `apps/mobile/app/(app)/chat/[id].tsx` direct chat screen with WhatsApp-like bubbles, read receipts, typing indicators, and optimistic sending.
  - Implement Unified Chat Inbox (`apps/mobile/app/(app)/chat/index.tsx`) switching between Personal Chats and Community Group Chats with live unread badge counters.

