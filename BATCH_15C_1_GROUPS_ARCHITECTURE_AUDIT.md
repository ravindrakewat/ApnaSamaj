# Apna Samaj — Batch 15C.1: Groups Module Architecture Audit & Implementation Plan

**Date:** 2026-10-30  
**Repository:** `c:\sunil kewat\dsas158\ApnaSamaj`  
**Current Branch:** `main`  
**Base Commit (HEAD):** `5db254bb8de727e542f58908f0fb18092f7fa881` (`5db254b`)  
**Audit Role:** Senior Software Architect & Security Auditor  
**Audit Scope:** READ-ONLY Architecture Audit, Database Schema Verification, Multi-Tenant Security Trace, API Contract Design, Frontend Readiness Review, Testing Matrix, and Implementation Roadmap for the Groups Module.

---

## 1. Executive Summary

The Groups module represents a core community engagement layer in Apna Samaj, providing regional mandals, youth chapters, and specialized circles where community members can assemble, hold focused discussions, share announcements, and communicate in real time.

An exhaustive read-only inspection of the codebase reveals that **the foundational architecture for Groups is already substantially in place**:
1. **Prisma Schema & Migrations:** The `Group` and `GroupMember` tables, enums (`GroupPrivacy`, `GroupMemberRole`), relations to `Post` (`groupId`) and `ChatMessage` (`groupId`), indexes, and cascade constraints were created in the monorepo's initial migration (`20261015135430_init_phase1_auth_feed_groups`) and are already deployed. **Zero Prisma schema modifications or database migrations are required for the Groups MVP.**
2. **Backend Services & Routes:** A feature-rich service (`groups.service.ts`), controller (`groups.controller.ts`), and route suite (`groups.routes.ts`) already exist and are mounted at `/api/v1/groups`. The service already incorporates robust concurrency guards (PostgreSQL row-level locking via `SELECT FOR UPDATE` to prevent leaving groups without an administrator), role hierarchy enforcement, immutable audit logging (`tx.auditLog.create`), and automated notification dispatches (`GROUP_ROLE_UPDATE`, `GROUP_MEMBER_REMOVED`).
3. **Multi-Tenant Scoping:** All routes require Bearer authentication, active user status (`requireActiveUser`), and verified community tenant context (`requireTenantContext`). Service functions strictly require a tenant-bound Prisma client (`assertDb(db)`) and fail closed if tenant context is missing.
4. **Frontend Experience:** Both [`GroupsPage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/GroupsPage.tsx) and [`GroupDetailPage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/GroupDetailPage.tsx) exist, with routes `/groups` and `/groups/:slug` mounted in `App.tsx` and linked from `Navbar.tsx`.
5. **Gaps to Bridge for Production Readiness:**
   - **Backend API Gaps:** Group deletion (`DELETE /api/v1/groups/:id`) is not implemented; direct member onboarding by admins (`POST /api/v1/groups/:id/members`) is missing (crucial for private groups since self-joining is blocked and no join-request model exists); dedicated paginated member listing (`GET /api/v1/groups/:id/members`) is missing; input validation lacks UUID schemas (`groupIdSchema`) and query bounds (`max(100)`).
   - **Frontend UX Gaps:** Missing two-way URL parameter synchronization via `useSearchParams` (refreshing resets search/tabs); missing input length boundaries; missing stale request cancellation (`requestIdRef`); missing group deletion UI; missing dedicated automated frontend UX test suite.

**Recommendation:** **GO FOR BATCH 15C.2 (Groups Hardening & Refinements)** with zero database schema migrations required.

---

## 2. Actual Repository & Prisma Schema Findings

### 2.1 Git Repository Preflight
- **Branch:** `main`
- **HEAD Commit:** `5db254bb8de727e542f58908f0fb18092f7fa881` (`5db254b`)
- **Parent Commit:** `ac336d4` (`feat(directory): member directory query bounds, sub-caste filter, uuid validation, and staging e2e verification`)
- **Status:** Local `main` is ahead of `origin/main` (`88ce7b8`) by 4 local commits (`f7ac1b5`, `eb82c0d`, `ac336d4`, `5db254b`).
- **Working Tree:** Completely clean for all tracked files. The only untracked files are the deliverable reports from recent batches (`BATCH_15B_8_CHECKPOINT_REPORT.md` and `BATCH_15B_9_MEMBER_DIRECTORY_INTEGRATION_REVIEW.md`).

### 2.2 Prisma Schema Models & Enums
Inspection of [`packages/database/prisma/schema.prisma`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/schema.prisma#L35-L45) lines 35–45 and lines 231–262 confirms the exact model definitions:

#### Enums
```prisma
enum GroupPrivacy {
  PUBLIC
  PRIVATE
}

enum GroupMemberRole {
  ADMIN
  MODERATOR
  MEMBER
}
```

#### Model `Group`
```prisma
model Group {
  id          String       @id @default(uuid())
  name        String
  slug        String       @unique
  description String?
  coverUrl    String?
  privacy     GroupPrivacy @default(PUBLIC)
  createdById String
  creator     User         @relation("GroupCreator", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  members      GroupMember[]
  posts        Post[]
  chatMessages ChatMessage[]

  @@index([privacy])
  @@index([createdById])
}
```

#### Model `GroupMember`
```prisma
model GroupMember {
  id        String          @id @default(uuid())
  groupId   String
  group     Group           @relation(fields: [groupId], references: [id], onDelete: Cascade)
  userId    String
  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      GroupMemberRole @default(MEMBER)
  joinedAt  DateTime        @default(now())

  @@unique([groupId, userId])
  @@index([userId])
}
```

#### Related Social Feed Integration ([`Post`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/schema.prisma#L268-L288))
```prisma
model Post {
  id        String    @id @default(uuid())
  authorId  String
  author    User      @relation("PostAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  groupId   String?
  group     Group?    @relation(fields: [groupId], references: [id], onDelete: SetNull)
  type      PostType  @default(GENERAL)
  content   String
  isPinned  Boolean   @default(false)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  ...
}
```

### 2.3 Migration & Constraints Verification
Inspection of [`packages/database/prisma/migrations/20261015135430_init_phase1_auth_feed_groups/migration.sql`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/migrations/20261015135430_init_phase1_auth_feed_groups/migration.sql#L82-L105) confirms:
- **Primary Keys:** UUID primary keys on `Group` (`id`) and `GroupMember` (`id`).
- **Uniqueness Constraints:**
  - `Group_slug_key`: `CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");`
  - `GroupMember_groupId_userId_key`: `CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");`
- **Foreign Key & Deletion Semantics:**
  - `Group.createdById` references `User.id` with `ON DELETE RESTRICT` (prevents deleting a community member who created a group without transferring or deleting the group first).
  - `GroupMember.groupId` references `Group.id` with `ON DELETE CASCADE` (deleting a group deletes all associated memberships).
  - `GroupMember.userId` references `User.id` with `ON DELETE CASCADE` (deleting a user removes them from all groups).
  - `Post.groupId` references `Group.id` with `ON DELETE SET NULL` (deleting a group preserves historical posts in general feed with null group ID).

### 2.4 Absence of Join Request / Invitation Tables
- There is **no `GroupJoinRequest` model** and **no `GroupInvitation` model** in the current Prisma schema or database migrations.
- There is **no `status` field** on `GroupMember` (members are either present or absent).
- **Architectural Conclusion:** Private group access in the MVP cannot support an asynchronous self-serve request/approval queue through the database without a schema migration. Instead, private groups operate as invitation/admin-added groups where group administrators or community moderators directly add members via API.

---

## 3. Existing vs Missing Functionality Inventory

### 3.1 Backend Functionality Matrix
| Feature | Endpoint / Component | Existing Status | Audit Assessment & Action Required |
| :--- | :--- | :---: | :--- |
| **List & Search Groups** | `GET /api/v1/groups` | **Implemented** | Functional with search, pagination, and privacy filter. Needs `search.max(100)` validation guard. |
| **Create Group** | `POST /api/v1/groups` | **Implemented** | Generates unique slug, sets creator as `ADMIN` in atomic transaction. |
| **Get Group Details** | `GET /api/v1/groups/:slug` | **Implemented** | Returns details, post counts, member counts, and membership status. Hides roster for private non-members. |
| **Get Group Discussions** | `GET /api/v1/groups/:slug/posts` | **Implemented** | Returns paginated posts with pinned ordering. Enforces membership for private groups. |
| **Join Public Group** | `POST /api/v1/groups/:id/join` | **Implemented** | Allows self-joining public groups. Rejects private groups with 403. Needs UUID parameter validation. |
| **Leave Group** | `POST /api/v1/groups/:id/leave` | **Implemented** | Uses `SELECT FOR UPDATE` row lock. Prevents sole administrator from leaving. |
| **Update Group Settings** | `PATCH /api/v1/groups/:id` | **Implemented** | Restricted to group `ADMIN` or platform `SUPER_ADMIN`. Logs to `AuditLog`. |
| **Upload Group Cover** | `POST /api/v1/groups/:id/cover` | **Implemented** | Multi-part image upload, transaction rollback guard, old storage cleanup. |
| **Update Member Role** | `PATCH /api/v1/groups/:id/members/:userId` | **Implemented** | Promotes/demotes between `ADMIN`, `MODERATOR`, `MEMBER`. Prevents sole admin demotion. Audit logged. |
| **Remove Member** | `DELETE /api/v1/groups/:id/members/:userId` | **Implemented** | Role hierarchy (mods cannot remove admins/mods). Prevents sole admin removal. Audit logged. |
| **Delete Group** | `DELETE /api/v1/groups/:id` | **MISSING** | **Must be implemented.** Authorized for group creator, group `ADMIN`, or `SUPER_ADMIN`. |
| **Add Member (Admin Direct)** | `POST /api/v1/groups/:id/members` | **MISSING** | **Must be implemented.** Enables adding members to private groups without schema changes. |
| **Paginated Members Endpoint** | `GET /api/v1/groups/:id/members` | **MISSING** | **Must be implemented.** `getGroupBySlug` currently embeds only the first 100 members. |
| **Request to Join Private Group**| `POST /api/v1/groups/:id/requests` | **NOT SUPPORTED** | Requires new database table (`GroupJoinRequest`). Deferred to post-MVP phase. |

### 3.2 Frontend Functionality Matrix
| Feature | Page / Component | Existing Status | Audit Assessment & Action Required |
| :--- | :--- | :---: | :--- |
| **Groups Directory Page** | `apps/web/src/pages/GroupsPage.tsx` | **Implemented** | Renders group cards, search bar, privacy tabs, and create dialog. |
| **URL Parameter Synchronization** | `GroupsPage.tsx` | **MISSING** | Needs `useSearchParams()` for `search`, `tab`, and `page` restoration and deep linking. |
| **Unified Debouncing & Stale Guard**| `GroupsPage.tsx` | **Partial** | Debouncing exists, but lacks `requestIdRef` anti-race condition protection. |
| **100-Char Input Bounds** | `GroupsPage.tsx` | **MISSING** | Inputs lack HTML5 `inputProps={{ maxLength: 100 }}` and `.slice(0, 100)` safeguards. |
| **Group Details Page** | `apps/web/src/pages/GroupDetailPage.tsx` | **Implemented** | Hero banner, Discussions tab, Members tab, Group Chat tab, Edit Settings, Upload Cover. |
| **Delete Group Action & Dialog** | `GroupDetailPage.tsx` | **MISSING** | Group admins cannot delete the group from the UI. |
| **Sanitized Error Presentation** | `GroupDetailPage.tsx` | **Partial** | Simple `Alert` banner; should be upgraded to an accessible `Paper` card like `MemberProfilePage`. |
| **Add Member to Private Group** | `GroupDetailPage.tsx` | **MISSING** | UI dialog for group admins to add community members to private groups. |
| **Automated Frontend Test Suite** | `apps/web/src/tests/groups-frontend-ux.test.ts` | **MISSING** | Must be created to verify UX invariants, URL sync, debouncing, and permission gates. |

---

## 4. Multi-Tenant Security & Authorization Trace

```
                     HTTP Request
                          │
                          ▼
            ┌───────────────────────────┐
            │     authenticateToken     │  Validates in-memory Bearer JWT
            └─────────────┬─────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │     requireActiveUser     │  Ensures User.status === 'ACTIVE'
            └─────────────┬─────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │    requireTenantContext   │  Resolves X-Community-Slug / Host
            └─────────────┬─────────────┘  Attaches req.tenant & req.db
                          │
                          ▼
            ┌───────────────────────────┐
            │       groupsRouter        │  Mounted at /api/v1/groups
            └─────────────┬─────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │     groups.service.ts     │  assertDb(req.db) fails closed
            └─────────────┬─────────────┘  Queries target tenant PostgreSQL
                          │
                          ▼
            ┌───────────────────────────┐
            │  Tenant-Bound PostgreSQL  │  Physical Isolation (Kewat vs Gupta)
            └───────────────────────────┘
```

### 4.1 Tenant Context Resolution
- The client attaches `X-Community-Slug: <community>` on every request via `apps/web/src/services/api.client.ts`.
- `requireTenantContext` inspects the request:
  - If tenant is unresolved or invalid, it immediately responds with HTTP 400 Bad Request (`"Community context and tenant database are required to access groups."`).
  - It injects the community's isolated database client instance into `req.db`.

### 4.2 Fail-Closed Service Guards (`assertDb`)
- Every function in `groups.service.ts` executes `const client = assertDb(db);`.
- If `db` is undefined, `assertDb` immediately throws `GroupServiceError('Tenant database connection is required for group operations.', 400)`.
- It **never** falls back to the global Prisma singleton.

### 4.3 Cross-Tenant Isolation
- Because all queries execute against `req.db`, groups and memberships for Community A exist only in Community A's database schema.
- If a member in Community A attempts to access `/api/v1/groups/gupta-circle` using a Kewat token, `req.db.group.findUnique({ where: { slug: 'gupta-circle' } })` returns `null`, cleanly throwing a generic `GroupNotFoundError` (HTTP 404). Cross-tenant group discovery is physically impossible.

### 4.4 Role-Based Authorization Hierarchy within Groups
```
                                 ┌──────────────────┐
                                 │   SUPER_ADMIN    │ (Platform-level override)
                                 └────────┬─────────┘
                                          │
                                 ┌────────▼─────────┐
                                 │   Group ADMIN    │ (Full group settings, roles, delete)
                                 └────────┬─────────┘
                                          │
                                 ┌────────▼─────────┐
                                 │ Group MODERATOR  │ (Moderate discussions, remove MEMBERS)
                                 └────────┬─────────┘
                                          │
                                 ┌────────▼─────────┐
                                 │   Group MEMBER   │ (View discussions, create posts, leave)
                                 └──────────────────┘
```

- **Sole Administrator Protection:**
  Whenever an admin attempts to leave the group (`leaveGroup`), demote their role (`updateGroupMemberRole`), or be removed (`removeGroupMember`), the service executes:
  ```typescript
  const adminCount = await tx.groupMember.count({
    where: { groupId, role: 'ADMIN' },
  });
  if (adminCount <= 1) {
    throw new GroupServiceError('Cannot leave/demote/remove the sole administrator of the group. Assign another administrator first.', 400);
  }
  ```
- **Row-Level Concurrency Locking:**
  All membership mutation operations (`leaveGroup`, `updateGroupMemberRole`, `removeGroupMember`) acquire a PostgreSQL row-level lock on the parent group record inside an atomic transaction:
  ```sql
  SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE
  ```
  This completely serializes concurrent membership changes and mathematically prevents racing requests from leaving a group orphaned without an administrator.

---

## 5. Proposed API Contract for Groups MVP

The table below outlines the proposed API surface for the completed Groups MVP, distinguishing existing endpoints from proposed additions and hardening:

### 5.1 Endpoint Specification

| Method | Path | Auth & Tenant | Input Schema | Permissions | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| `GET` | `/api/v1/groups` | Bearer + Active + Tenant | `listGroupsQuerySchema` (page, limit, search, privacy) | Any active member | **Existing (Harden search length)** |
| `POST` | `/api/v1/groups` | Bearer + Active + Tenant | `createGroupSchema` (name, desc, privacy, coverUrl) | Any active member | **Existing** |
| `GET` | `/api/v1/groups/:slug` | Bearer + Active + Tenant | `slug` param (string) | Any active member (roster hidden if private non-member) | **Existing** |
| `DELETE`| `/api/v1/groups/:id` | Bearer + Active + Tenant | `id` param (`groupIdSchema` UUID) | Group `ADMIN` or platform `SUPER_ADMIN` | **PROPOSED (New in 15C.2)** |
| `PATCH` | `/api/v1/groups/:id` | Bearer + Active + Tenant | `id` (UUID), `updateGroupSchema` | Group `ADMIN` or `SUPER_ADMIN` | **Existing (Harden UUID)** |
| `POST` | `/api/v1/groups/:id/cover` | Bearer + Active + Tenant | `id` (UUID), multipart image | Group `ADMIN` or `SUPER_ADMIN` | **Existing (Harden UUID)** |
| `POST` | `/api/v1/groups/:id/join` | Bearer + Active + Tenant | `id` (UUID) | Active non-member (Public groups only) | **Existing (Harden UUID)** |
| `POST` | `/api/v1/groups/:id/leave` | Bearer + Active + Tenant | `id` (UUID) | Active group member (cannot be sole admin) | **Existing (Harden UUID)** |
| `GET` | `/api/v1/groups/:slug/posts` | Bearer + Active + Tenant | `slug`, page, limit | Any member for public; joined member for private | **Existing** |
| `GET` | `/api/v1/groups/:id/members` | Bearer + Active + Tenant | `id` (UUID), page, limit, search | Any member for public; joined member for private | **PROPOSED (New in 15C.2)** |
| `POST` | `/api/v1/groups/:id/members` | Bearer + Active + Tenant | `id` (UUID), `body: { userId: UUID, role?: GroupMemberRole }` | Group `ADMIN` or `SUPER_ADMIN` (onboard private members) | **PROPOSED (New in 15C.2)** |
| `PATCH` | `/api/v1/groups/:id/members/:userId` | Bearer + Active + Tenant | `id` (UUID), `userId` (UUID), `updateMemberRoleSchema` | Group `ADMIN` or `SUPER_ADMIN` | **Existing (Harden UUIDs)** |
| `DELETE`| `/api/v1/groups/:id/members/:userId` | Bearer + Active + Tenant | `id` (UUID), `userId` (UUID) | Group `ADMIN`, `MODERATOR` (MEMBER only), or `SUPER_ADMIN` | **Existing (Harden UUIDs)** |

### 5.2 Negative Test Cases Required
1. Non-existent group ID &rarr; HTTP 404 (`Group not found`).
2. Malformed non-UUID `id` or `userId` &rarr; HTTP 400 (`Invalid group ID format. Expected a valid UUID.`).
3. Non-member attempting to join private group &rarr; HTTP 403 (`Forbidden: Cannot self-join private group`).
4. Non-member attempting to fetch private group discussions &rarr; HTTP 403 (`Forbidden: Membership required`).
5. Sole administrator attempting to leave group &rarr; HTTP 400 (`Cannot leave the group without assigning another admin first`).
6. Sole administrator attempting to demote themselves &rarr; HTTP 400 (`Cannot demote the sole administrator`).
7. Moderator attempting to demote or remove an administrator &rarr; HTTP 403 (`Moderators cannot remove administrators`).
8. Missing `X-Community-Slug` &rarr; HTTP 400 (`Community context and tenant database are required`).
9. Duplicate membership join request &rarr; HTTP 400 (`You are already a member of this group`).
10. Search query exceeding 100 characters &rarr; HTTP 400 (`Search query cannot exceed 100 characters`).

---

## 6. Privacy & Authorization Rules

1. **Public vs Private Group Discovery:**
   - Public groups display full details, discussions, and member rosters to any verified community member.
   - Private groups appear in the directory listing (name, description, member count, post count) so members know of their existence, but:
     - Discussion feed returns HTTP 403 for non-members.
     - Member roster is completely empty (`[]`) for non-members.
     - Direct self-joining returns HTTP 403.
2. **PII and Data Minimization:**
   - Group member objects in API responses use `GroupMemberUserSummary` (`id`, `fullName`, `avatarUrl`, `city`, `state`).
   - Phone numbers, password hashes, dates of birth, and auth tokens are **never** queried or included.
3. **Group Deletion Authorization & Cleanup:**
   - Only the group creator, an active group `ADMIN`, or a platform `SUPER_ADMIN` can delete a group.
   - Deleting a group cascades to delete all `GroupMember` records.
   - Associated `Post` records have `groupId` set to `NULL` (`onDelete: SetNull`), preserving user content without breaking database integrity.
   - Cover images stored in object storage are asynchronously scheduled for cleanup.
4. **Audit Logging:**
   - Every administrative action (`GROUP_SETTINGS_UPDATE`, `GROUP_ROLE_UPDATE`, `GROUP_MEMBER_REMOVE`, `GROUP_DELETED`) records an immutable `AuditLog` row containing `actorId`, `action`, `targetType`, `targetId`, `details`, `ipAddress`, and `userAgent`.

---

## 7. Frontend Implementation Plan

### 7.1 Page & Component Architecture
```
apps/web/src/
├── pages/
│   ├── GroupsPage.tsx               # Enhanced with 2-way URL sync, 100-char limits, stale guards
│   └── GroupDetailPage.tsx          # Enhanced with Delete Group dialog, Add Member dialog, error paper card
├── components/
│   ├── groups/
│   │   ├── GroupCard.tsx            # Extracted modular card component with responsive badges
│   │   ├── CreateGroupDialog.tsx    # Bounded form dialog (3-100 chars name, 1000 chars desc)
│   │   ├── DeleteGroupDialog.tsx    # Confirmation dialog for group administrators
│   │   ├── AddMemberDialog.tsx      # Member picker dialog for private group administrators
│   │   └── GroupMembersTab.tsx      # Roster management with pagination and search
│   ├── CreatePostComposer.tsx       # Existing reusable discussion creator
│   └── PostCard.tsx                 # Existing reusable post renderer
└── services/
    └── groups.service.ts            # Extended with deleteGroupApi, addGroupMemberApi, fetchGroupMembersApi
```

### 7.2 Two-Way URL Parameter Synchronization (`GroupsPage.tsx`)
Following the successful pattern established in Batch 15B.6 for `DirectoryPage.tsx`:
- Parse URL on mount:
  ```typescript
  const [searchParams, setSearchParams] = useSearchParams();
  const search = (searchParams.get('search') || '').slice(0, 100);
  const privacy = (searchParams.get('privacy') as 'ALL' | 'PUBLIC' | 'PRIVATE') || 'ALL';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  ```
- Unified 400ms debouncing across search and tab filters.
- Push state into URL with `setSearchParams(..., { replace: true })`, omitting empty parameters and `page=1`.
- Preserve unrelated query parameters (`community=kewat`).
- Employ `lastSyncedParamsRef` to prevent circular re-render loops.

### 7.3 Accessible Error & Unavailable Group Presentation
Upgrade `GroupDetailPage.tsx` error states to match `MemberProfilePage.tsx`:
- Non-existent or deleted group renders an accessible `Paper` card with `LockIcon` or `GroupsIcon`, heading `"Group Unavailable"`, a generic message, and a `"Back to Groups"` primary button.
- Strictly avoids leaking whether a private group exists to unauthorized callers if tenant scoping fails.

---

## 8. Comprehensive Testing Matrix

### 8.1 Pure Unit Tests (Zero Database Writes, In-Memory Mocks)
- **File:** `apps/api/src/tests/groups-refinements.test.ts`
- **Target Assertions:** ~50 assertions
  - Validation schemas (`createGroupSchema`, `updateGroupSchema`, `listGroupsQuerySchema`, `updateMemberRoleSchema`, `groupIdSchema`, `addGroupMemberSchema`).
  - Search query 100-character bounds rejection.
  - UUID format enforcement on all route parameters.
  - Slug generation and slug collision handling.
  - Concurrency mock test: sole-admin leave and demote rejection.
  - Role hierarchy mock test: moderator removal restrictions.
  - Privacy invariant: non-member private group roster masking.

### 8.2 Tenant Isolation Tests (Multi-Tenant Mock Clients)
- **File:** `apps/api/src/tests/posts-groups-matrimonial-tenant.test.ts` (Existing, verified 32 passed).
- **Target Extensions:**
  - Verify Kewat group cannot be queried, updated, joined, or deleted via Gupta tenant client.
  - Verify missing tenant context fails closed with HTTP 400.

### 8.3 Frontend UX & State Synchronization Tests
- **File:** `apps/web/src/tests/groups-frontend-ux.test.ts`
- **Target Assertions:** ~40 assertions
  - URL parameter serialization and restoration.
  - 400ms debounced search timer and cancellation.
  - Input length bounds (100 characters max).
  - Stale request discarding via `requestIdRef`.
  - Empty state and filter reset behavior.
  - Privacy and role badge rendering invariants.

### 8.4 Staging Database Integration Tests (Local PostgreSQL Staging Only)
- **File:** `apps/api/src/tests/staging-groups-e2e.test.ts`
- **Safety Guards:**
  - Strictly requires `localhost` / `127.0.0.1` and `apnasamaj_staging_kewat`.
  - Strictly rejects Supabase Tokyo production URLs.
  - Clean synthetic fixtures (`+919999900091` to `+919999900095`).
- **Target Assertions:** ~45 assertions
  - Real database transactions, row-level locks, audit log creation, and cascade deletions.

---

## 9. Schema & Migration Requirements

### **Are Schema Changes Necessary for Groups MVP?**
**NO.** The current Prisma schema in [`packages/database/prisma/schema.prisma`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/schema.prisma) fully supports:
- `Group` table with unique `slug`, `privacy`, and `creator` relation.
- `GroupMember` table with unique constraint `[groupId, userId]`, `role` enum (`ADMIN`, `MODERATOR`, `MEMBER`), and cascade deletion.
- `Post` relation with `groupId`.
- `ChatMessage` relation with `groupId`.

### Future Post-MVP Schema Extensions (Optional, Deferred)
If asynchronous join requests or invite codes are requested in a future release:
```prisma
// OPTIONAL FUTURE MODEL (NOT NEEDED FOR MVP)
model GroupJoinRequest {
  id        String   @id @default(uuid())
  groupId   String
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  status    String   @default("PENDING") // PENDING, APPROVED, REJECTED
  createdAt DateTime @default(now())

  @@unique([groupId, userId])
}
```
For the first Groups release, using the existing schema without migrations ensures zero downtime, zero migration risk, and rapid delivery.

---

## 10. Risks, Dependencies & Open Decisions

| Risk / Decision | Severity | Analysis & Mitigation |
| :--- | :---: | :--- |
| **Slug Collisions on Group Creation** | Low | Handled automatically by `createGroup` via suffix counter (`slug-1`, `slug-2`). |
| **Sole Admin Group Abandonment** | High | Mitigated by transactional row-level lock (`SELECT FOR UPDATE`) and count check (`adminCount <= 1`). |
| **Private Group Onboarding** | Medium | Since join requests do not exist in schema, `POST /api/v1/groups/:id/members` allows admins to directly add members to private groups. |
| **Large Group Roster Pagination** | Low | Currently `take: 100`. Introducing `GET /api/v1/groups/:id/members` ensures scalable roster browsing. |
| **Orphaned Storage Objects on Cover Delete** | Low | Service already implements transactional rollback cleanup and superseding cover image deletion. |

---

## 11. Implementation Roadmap & Recommendation

### Proposed Batch Breakdown for Groups Module

```
  ┌─────────────────────────────────────────────────────────────┐
  │ Batch 15C.1: Groups Architecture Audit & Implementation Plan│ (COMPLETE)
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │ Batch 15C.2: Groups Backend Hardening & API Refinements     │
  │ - Add groupIdSchema UUID validation                         │
  │ - Implement DELETE /api/v1/groups/:id                       │
  │ - Implement POST /api/v1/groups/:id/members (admin add)     │
  │ - Implement GET /api/v1/groups/:id/members (paginated)      │
  │ - Create apps/api/src/tests/groups-refinements.test.ts      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │ Batch 15C.3: Groups Staging E2E Verification & Audit Check  │
  │ - Run staging-groups-e2e.test.ts on localhost PostgreSQL    │
  │ - Pre-commit Git safety audit & checkpoint commit           │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │ Batch 15C.4: Groups Frontend Refinement & UX Integration    │
  │ - Implement 2-way URL search parameter synchronization      │
  │ - Add 100-character input bounds & accessibility attributes │
  │ - Implement Delete Group & Add Member UI dialogs            │
  │ - Create apps/web/src/tests/groups-frontend-ux.test.ts      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │ Batch 15C.5: Groups Final Checkpoint & Regression Review    │
  │ - Full monorepo typecheck, build, and regression suites     │
  │ - Local Git checkpoint commit                               │
  └─────────────────────────────────────────────────────────────┘
```

---

### **ARCHITECTURAL RECOMMENDATION: GO FOR BATCH 15C.2**

**Verdict:** The monorepo is in an optimal state to begin **Batch 15C.2 (Groups Backend Hardening & API Refinements)**. The schema is ready, the core services and controllers are well-structured, multi-tenant isolation is battle-tested, and no database migrations are needed.

*In accordance with the read-only audit instructions, zero application code was modified, zero database writes were executed, and zero Git operations were performed.*

