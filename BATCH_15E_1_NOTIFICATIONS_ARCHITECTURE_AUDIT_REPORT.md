# Apna Samaj — Batch 15E.1: Notifications Architecture Audit Report

**Date:** October 31, 2026
**Auditor / Role:** Senior System Architect, Security Lead & QA Engineer
**Repository:** `ravindrakewat/ApnaSamaj` (`https://github.com/ravindrakewat/ApnaSamaj.git`)
**Active Branch:** `main`
**Current HEAD:** `4e7e61560275d8e3fc4319c7b63c8d0ad3380726` (`4e7e615`)
**Audit Scope:** In-App Notification System (Database Models, API Routes, Sockets, Frontend UX, Security & Multi-Tenancy)
**Audit Classification:** READ-ONLY Architectural Audit

---

## 1. Executive Summary

This audit assesses the state of the In-App Notifications system across the Apna Samaj monorepo.

### Key Audit Findings:
1. **Extensive Existing Foundation:** The notification subsystem is substantially implemented across database persistence (Prisma PostgreSQL), backend REST endpoints (Express + TypeScript), real-time WebSockets (Socket.IO), and frontend UI components (Material UI in React).
2. **Robust Multi-Tenant Security:** All notification queries strictly use `req.db` and validate tenant database context. Missing tenant context fails closed with HTTP 400. Socket.IO connections enforce tenant origin resolution and verify user credentials against the tenant database before admitting sockets to rooms.
3. **Comprehensive Test Suite:** 5 separate automated test suites covering notification service contracts, physical database isolation, moderation queue routing, Socket.IO real-time emission, and frontend deep linking were executed live, achieving **197 passed assertions with 0 failures**.
4. **Key Functional Gaps Identified:**
   - **UUID Route Parameter Validation:** Route parameters (`:id`) in `PATCH /api/v1/notifications/:id/read` and `DELETE /api/v1/notifications/:id` use `idParamSchema` with `z.string().min(1)` rather than strict UUID v4 validation (`z.string().uuid()`), allowing malformed IDs to pass controller parsing.
   - **Hindi Localization Gap:** While the top navigation bar and social feed use Hindi labels (`होम`, `समाज अपडेट्स`, `समूह`, `सदस्य`, `मेरी प्रोफ़ाइल`, etc.), all labels and empty states in `NotificationBell.tsx` remain hardcoded in English.
   - **Missing Notification Triggers for Admin Actions:** `ACCOUNT_STATUS_UPDATE`, `MATRIMONIAL_PROFILE_APPROVED`, and `MATRIMONIAL_PROFILE_REJECTED` are defined in the Prisma `NotificationType` enum, but admin status modifications in `admin.service.ts` and admin profile approvals in `matrimonial.service.ts` do not dispatch in-app notifications.
   - **No Dedicated Full-Page Route (`/notifications`):** Notifications are accessible exclusively via the dropdown `Popover` in `NotificationBell.tsx`. No full-page view exists for mobile users or power users reviewing long notification histories.

---

## 2. Discovered Existing Implementation

### 2.1 Database Models & Enums (`packages/database/prisma/schema.prisma`)

- **Prisma Model:** `Notification`
  - `id`: `String @id @default(uuid())`
  - `recipientId`: `String` (foreign key to `User.id`, `onDelete: Cascade`)
  - `actorId`: `String?` (foreign key to `User.id`, `onDelete: SetNull`)
  - `type`: `NotificationType`
  - `title`: `String`
  - `message`: `String`
  - `entityType`: `String?` (e.g. `'POST'`, `'GROUP'`)
  - `entityId`: `String?` (e.g. post UUID, group UUID)
  - `isRead`: `Boolean @default(false)`
  - `readAt`: `DateTime?`
  - `createdAt`: `DateTime @default(now())`
  - **Indexes:**
    - `@@index([recipientId, isRead])` — Optimized for unread count badge & unread-only feed.
    - `@@index([recipientId, createdAt(sort: Desc)])` — Optimized for paginated reverse-chronological notification list.
  - *Note:* The model does not include an `updatedAt` field, which is acceptable since notifications are immutable except for read state.

- **Prisma Enum:** `NotificationType`
  1. `POST_LIKE`
  2. `POST_COMMENT`
  3. `GROUP_ROLE_UPDATE`
  4. `GROUP_MEMBER_REMOVED`
  5. `ACCOUNT_STATUS_UPDATE`
  6. `POST_MODERATED`
  7. `MATRIMONIAL_INTEREST_RECEIVED`
  8. `MATRIMONIAL_INTEREST_ACCEPTED`
  9. `MATRIMONIAL_PROFILE_APPROVED`
  10. `MATRIMONIAL_PROFILE_REJECTED`

- **Database Migrations:**
  - `20261020151500_add_notification_model/migration.sql`: Created `NotificationType` enum, `Notification` table, indexes, and foreign keys.
  - `20261020203000_add_matrimonial_module/migration.sql`: Added matrimonial notification types to the enum.

### 2.2 Backend REST API (`apps/api/src/modules/notifications/`)

- **Route Definitions (`notifications.routes.ts`):**
  - All routes protected by middleware chain: `authenticateToken`, `requireActiveUser`, `requireTenantContext`.
  - `GET /api/v1/notifications/unread-count`: Fast unread counter badge.
  - `GET /api/v1/notifications`: Paginated feed with optional `unreadOnly=true` query filter.
  - `PATCH /api/v1/notifications/read-all`: Batch mark all unread notifications as read.
  - `PATCH /api/v1/notifications/:id/read`: Mark single notification as read.
  - `DELETE /api/v1/notifications/:id`: Delete notification.

- **Controller (`notifications.controller.ts`):**
  - Handlers: `getUnreadCountHandler`, `getNotificationsHandler`, `markAsReadHandler`, `markAllAsReadHandler`, `deleteNotificationHandler`.
  - Uses `notificationsQuerySchema` to validate `page` and `limit`.
  - Uses `idParamSchema` from `@apnasamaj/validation` for `:id` parameter (*finding: lacks strict UUID validation*).

- **Service (`notifications.service.ts`):**
  - `getUnreadCount(userId, db)`: Fast indexed count.
  - `getNotifications(userId, query, db)`: Paginated fetch (default limit 20, max 50).
  - `markAsRead(id, userId, db)`: Strict recipient ownership verification; emits updated unread count via Socket.IO.
  - `markAllAsRead(userId, db)`: Batch update; emits unread count `0` via Socket.IO.
  - `deleteNotification(id, userId, db)`: Strict ownership check; deletes record and emits updated unread count.
  - `sendNotificationSafely(params, db)`:
    - Safe, non-blocking side-effect that swallows errors without failing primary transactions.
    - Suppresses self-action notifications (`recipientId === actorId`).
    - Enforces 24-hour unread deduplication safeguard on `POST_LIKE`.
    - Dispatches real-time notification to user's Socket.IO room.
  - `sendReportResolutionNotification(client, recipientId, reportId, postId, decision, tenantSlug)`:
    - Deduplicates reporter notifications.
    - Sets `actorId: null` to keep moderator identity confidential.

### 2.3 Real-Time WebSocket Infrastructure (`apps/api/src/modules/chat/chat.socket.ts`)

- **Socket.IO Server Initialization:**
  - Attached to HTTP server via `initChatSocketServer(httpServer)`.
  - CORS strictly configured with community origins and allowed headers.
- **Tenant Resolution & Auth Middleware (`chatSocketAuthMiddleware`):**
  - Resolves community slug from handshake (`Origin`, `Referer`, `Host`, `X-Community-Slug`, query param).
  - Verifies community exists in `tenantDbManager`.
  - Validates JWT Bearer access token using `verifyAccessToken`.
  - Queries user in tenant database; rejects suspended/inactive accounts.
  - Binds user, tenant slug, and tenant database client to `socket.data`.
- **User Notification Rooms:**
  - Auto-joins room: `${tenantSlug}:user:${user.id}` upon connection.
  - `join_user_notifications` listener blocks any attempt to subscribe to another user's room (`if (payload.userId !== user.id) -> Forbidden`).
- **Real-Time Notification Events:**
  - `notification:new`: Emits sanitized `NotificationItem` payload to recipient's room.
  - `notification:unread-count`: Emits updated unread counter integer.

### 2.4 Existing Event Triggers Across Modules

| Event Source | Module File | Trigger Condition | Notification Type | Deduplication & Privacy Guards |
|:---|:---|:---|:---|:---|
| **Post Like** | `posts.service.ts:1161` | Post liked by another member | `POST_LIKE` | Self-like suppressed; 24h unread deduplication |
| **Post Comment** | `posts.service.ts:1438` | Post commented on by another member | `POST_COMMENT` | Self-comment suppressed |
| **Post Moderation (Author)** | `posts.service.ts:868` | Moderator takes down post | `POST_MODERATED` | Actor set to null (confidential moderator) |
| **Post Moderation (Reporter)** | `posts.service.ts:911` | Reporter notified upon action taken | `POST_MODERATED` | Deduplicated per report/post |
| **Group Role Update** | `groups.service.ts:845` | Member promoted or role updated | `GROUP_ROLE_UPDATE` | Safe async side-effect |
| **Group Member Removed** | `groups.service.ts:984` | Member removed from group | `GROUP_MEMBER_REMOVED` | Safe async side-effect |
| **Group Member Added** | `groups.service.ts:1355`| Member added to group | `GROUP_ROLE_UPDATE` | Safe async side-effect |
| **Appeal Submitted** | `appeals.service.ts:121`| Member files moderation appeal | `ACCOUNT_STATUS_UPDATE` | Author confirmation; actor set to null |
| **Appeal Decision** | `appeals.service.ts:394`| Moderator resolves appeal | `ACCOUNT_STATUS_UPDATE` | Internal review notes strictly concealed |
| **Matrimonial Interest** | `matrimonial.service.ts:1221`| Member expresses interest | `MATRIMONIAL_INTEREST_RECEIVED` | Safe async side-effect |
| **Matrimonial Accepted** | `matrimonial.service.ts:1579`| Member accepts interest | `MATRIMONIAL_INTEREST_ACCEPTED` | Safe async side-effect |

### 2.5 Frontend Implementation (`apps/web/src/components/NotificationBell.tsx`)

- **Location:** Mounted in `Navbar.tsx` alongside navigation links on all viewport sizes.
- **Visual Presentation:**
  - Bell icon with unread badge counter (`Badge max={99}`).
  - Dropdown `Popover` (width: `calc(100vw - 24px)` on mobile, `380px` on desktop; max height `520px`).
  - Two tabs: "All" and "Unread (N)".
  - Avatar with actor initials / photo and colored type badge (Pink: Like, Blue: Comment, Orange: Moderation, Green: Group, Purple: Matrimonial).
  - Relative time display via `formatRelativeTime(date)` (`Just now`, `5m ago`, `3h ago`, `4d ago`).
  - Secondary action buttons: individual "Mark as read" and "Delete".
  - Top action button: "Mark all read".
  - Deep-link navigation via `resolveNotificationTarget(item)` on click.
- **State & Optimistic Updates:**
  - Immediate optimistic unread count and read state updates on mark read, mark all read, and delete.
  - Automatic rollback on API error.
  - Duplicate socket event suppression (`if (prev.some(n => n.id === newNotif.id)) return prev;`).
  - Re-synchronization on Socket.IO reconnect and window focus events.

---

## 3. Security & Multi-Tenancy Invariant Audit

| Security Invariant | Requirement | Status | Verification Reference |
|:---|:---|:---|:---|
| **Explicit Tenant Context** | All requests must require tenant identification | **PASS** | `notificationsRouter.use(requireTenantContext)` |
| **Tenant-Scoped DB Only** | All queries must execute via `req.db` | **PASS** | `assertDb(req.db)` in `notifications.service.ts` |
| **Missing Tenant Fails Closed** | Missing `req.db` returns HTTP 400 | **PASS** | Throws `NotificationServiceError(..., 400)` |
| **User Data Isolation** | Users can only query own notifications | **PASS** | `where: { recipientId: userId }` |
| **Read/Delete Tamper Resistance**| Non-owners cannot mark/delete other notifications | **PASS** | `if (notification.recipientId !== userId) throw new NotificationNotFoundError()` (404) |
| **Zero Sensitive Data Leakage**| Payloads omit secrets, passwords, tokens, phone numbers | **PASS** | Actor include restricted strictly to `fullName` and `avatarUrl` |
| **Moderator Identity Protection**| Moderator identity concealed in moderation/appeal alerts | **PASS** | `actorId: null` enforced on moderation/appeal notifications |
| **Socket Room Isolation** | Sockets cannot join other user or community rooms | **PASS** | Room name `${tenantSlug}:user:${userId}`; `join_user_notifications` rejects mismatched user IDs |
| **SUPER_ADMIN Scoping** | Super admin actions cannot bypass tenant database isolation | **PASS** | Multi-tenant tenant database isolation preserved |

---

## 4. Functional Gap Analysis

| Capability | Status | Description & Findings |
|:---|:---|:---|
| **Notification Creation & Persistence** | **Implemented** | Robust database schema with cascade deletion and indexing. |
| **Unread Counter** | **Implemented** | Dedicated `GET /unread-count` and unread count included in list response. |
| **Mark One as Read** | **Partially Implemented** | Implemented with optimistic UI, but route parameter `:id` lacks strict UUID validation. |
| **Mark All as Read** | **Implemented** | Batch update endpoint `PATCH /read-all` with unread count reset. |
| **Pagination & Query Limits** | **Implemented** | Bounded limit (max 50, default 20) with page/totalPages/hasMore. |
| **Duplicate Prevention** | **Implemented** | 24-hour unread deduplication on likes, moderation deduplication, frontend socket deduplication. |
| **Real-Time Delivery & Reconnect** | **Implemented** | Socket.IO rooms, `notification:new`, `notification:unread-count`, auto-sync on reconnect. |
| **Loading, Empty & Error States** | **Implemented** | Circular progress, empty state icons, retry buttons on network error. |
| **Mobile & Desktop UX** | **Partially Implemented** | Popover adapts width to mobile, but no dedicated `/notifications` full-page route exists. |
| **Hindi Localization** | **Missing** | `NotificationBell.tsx` strings are entirely in English, inconsistent with Navbar/Feed. |
| **UUID Route Parameter Validation** | **Missing** | `:id` uses `idParamSchema` (`z.string().min(1)`) rather than strict UUID schema. |
| **Admin Action Triggers** | **Missing** | `ACCOUNT_STATUS_UPDATE` and matrimonial approval/rejection notifications are not emitted on admin actions. |

---

## 5. Test Suite Verification Results

All 5 test suites covering the notification subsystem were executed live during this audit:

| Test Suite File | Test Scope | Assertions / Status | Outcome |
|:---|:---|:---|:---|
| `apps/api/src/tests/notifications.test.ts` | Backend isolation, unread count, ownership, deduplication, privacy | 31 / 31 passing | **PASS** |
| `apps/api/src/tests/notifications-chat-tenant.test.ts` | Multi-tenant physical DB isolation & Socket.IO handshake invariants | 47 / 47 passing | **PASS** |
| `apps/api/src/tests/realtime-moderation-notifications.test.ts` | Moderation queue rooms, reporter notifications & information hiding | 47 / 47 passing | **PASS** |
| `apps/api/src/tests/realtime-notifications-socket.test.ts` | Socket.IO room lifecycle, authentication, event delivery & crash isolation | 35 / 35 passing | **PASS** |
| `apps/web/src/tests/notifications-experience.test.ts` | Route resolution, query generation, optimistic math, relative timestamps | 37 / 37 passing | **PASS** |

**Total Live Verified Assertions:** **197 passed, 0 failed, 0 skipped**.

---

## 6. Recommended Next Implementation Batches

Based on the audit findings, the notification architecture is sound and secure, but requires two focused refinement batches:

### Recommended Batch 1: **Batch 15E.2 — Notifications Backend Hardening & Admin Trigger Integration**
1. **UUID Route Parameter Validation:**
   - Define `notificationIdParamSchema = z.object({ id: z.string().uuid('Invalid notification ID format') })` in `packages/validation/src/notification.ts`.
   - Update `markAsReadHandler` and `deleteNotificationHandler` in `notifications.controller.ts` to use strict UUID validation.
   - Return HTTP 400 for malformed IDs without hitting Prisma.
2. **Admin Status Notification Triggers:**
   - In `apps/api/src/modules/admin/admin.service.ts`, dispatch `ACCOUNT_STATUS_UPDATE` in-app notification via `sendNotificationSafely` when a member account is suspended, banned, or verified.
3. **Matrimonial Approval Notification Triggers:**
   - In `apps/api/src/modules/matrimonial/matrimonial.service.ts`, dispatch `MATRIMONIAL_PROFILE_APPROVED` or `MATRIMONIAL_PROFILE_REJECTED` in-app notification when an admin reviews a profile.
4. **Automated Verification:**
   - Add backend test suite verifying UUID validation 400 responses and admin notification triggers.

### Recommended Batch 2: **Batch 15E.3 — Notifications Frontend Hindi Localization & UX Refinements**
1. **Hindi Localization of `NotificationBell.tsx`:**
   - "सूचनाएं" (Notifications)
   - "सभी पढ़ी हुई मार्क करें" (Mark all read)
   - "सभी" (All) / "अपठित" (Unread)
   - "कोई नई सूचना नहीं है" (No unread notifications)
   - "अभी तक कोई सूचना नहीं" (No notifications yet)
   - "पुरानी सूचनाएं लोड करें" (Load older notifications)
   - "पुनः प्रयास करें" (Retry)
2. **Dedicated `/notifications` Full-Page View (Optional):**
   - Provide a full-page notification history route for mobile users.
