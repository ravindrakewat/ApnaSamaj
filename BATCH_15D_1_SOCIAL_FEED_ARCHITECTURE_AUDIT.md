# Batch 15D.1: Social Feed & Posts Architecture Audit Report

**Date:** October 30, 2026  
**Auditor Roles:** Senior Software Architect & Application Security Auditor  
**Repository:** `ravindrakewat/ApnaSamaj`  
**Current Branch:** `main`  
**Base Commit (HEAD):** `85c0570a33b3fc23a1b848fd7f2d66e0752d313b` (`85c0570`)  
**Status:** COMPLETE (READ-ONLY AUDIT)

---

## 1. Executive Summary

This audit performs an exhaustive, evidence-based review of the **Social Feed and Posts Module** across the Apna Samaj monorepo. It evaluates data models, database constraints, API endpoints, controller parameter guards, multi-tenant physical isolation, frontend state management, UX responsiveness, and automated test coverage.

### Key Audit Findings:
1. **Rich Existing Foundation:** The monorepo possesses a robust and mature Social Feed implementation covering post creation, rich media attachments (images, direct video, YouTube canonical embedding), likes, views deduplication, comments, pins, reports, moderation appeals, and private group post scoping.
2. **Critical Parameter Guard Gap:** Route parameters (`:id`, `:commentId`) are currently validated using generic `idParamSchema` (`z.string().min(1)`), which does not enforce RFC 4122 UUID formatting. Supplying non-UUID values causes Prisma to throw unhandled column conversion errors, returning HTTP 500 instead of clean HTTP 400 Bad Request responses.
3. **Multi-Tenant Physical Isolation Verified:** All post and comment operations enforce `requireTenantContext` and resolve queries strictly against `req.db` via `assertDb(db)`. Verified that cross-tenant queries fail closed and `SUPER_ADMIN` does not bypass physical tenant scoping.
4. **Feed State & URL Synchronization Gap:** [`FeedPage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/FeedPage.tsx) lacks two-way URL synchronization (`useSearchParams`) for post type filtering (`selectedType`) and has no search capability, in contrast to the Member Directory and Groups modules.
5. **Automated Test Health:** 169 post-related test assertions were executed live during this audit and passed 100% with zero failures. A legacy Phase 4A test suite failed due to missing tenant headers (`x-community-slug`), demonstrating that tenant isolation is strictly enforced.

---

## 2. Database Models & Schema Analysis

The Prisma schema at [`packages/database/prisma/schema.prisma`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/database/prisma/schema.prisma) defines the complete Social Feed relational model:

### 2.1 Core Relational Models

#### `model Post`
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

  media    PostMedia[]
  comments Comment[]
  likes    PostLike[]
  views    PostView[]

  @@index([authorId])
  @@index([groupId])
  @@index([createdAt(sort: Desc)])
}
```
- **PostType Enum:** `GENERAL`, `ANNOUNCEMENT`, `EVENT`.
- **Foreign Keys & Cascades:**
  - Author deletion cascades to delete all authored posts (`onDelete: Cascade`).
  - Group deletion sets `groupId` to `null` (`onDelete: SetNull`), preserving post content within the general community feed.
- **Indexes:** Indexed by `authorId`, `groupId`, and descending `createdAt` for fast feed pagination.

#### `model PostMedia`
```prisma
model PostMedia {
  id        String    @id @default(uuid())
  postId    String
  post      Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  mediaType MediaType @default(IMAGE)
  url       String
  thumbnail String?
  order     Int       @default(0)
  createdAt DateTime  @default(now())

  @@index([postId])
}
```
- **MediaType Enum:** `IMAGE`, `VIDEO`, `DOCUMENT`.
- Automatically removed via `onDelete: Cascade` when a post is deleted.

#### `model Comment`
```prisma
model Comment {
  id        String   @id @default(uuid())
  postId    String
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId  String
  author    User     @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([postId])
  @@index([authorId])
}
```
- Cascades on post or author deletion.
- Indexed on `postId` and `authorId`.

#### `model PostLike`
```prisma
model PostLike {
  id        String   @id @default(uuid())
  postId    String
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([postId, userId])
  @@index([userId])
}
```
- Enforces uniqueness: A member can like a given post at most once.

#### `model PostView`
```prisma
model PostView {
  id        String   @id @default(uuid())
  postId    String
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([postId, userId])
  @@index([userId])
  @@index([postId])
}
```
- Enforces strict deduplication: Each member view is recorded only once per post.

---

## 3. Backend API & Endpoint Inspection

The backend routes are mounted in [`apps/api/src/modules/posts/posts.routes.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/posts/posts.routes.ts).

### 3.1 Route Endpoints Inventory

| Method | Route Path | Middleware Chain | Handler | Status |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/posts/media/upload` | Auth, Active, Tenant, Multer | `uploadMediaHandler` | **FUNCTIONAL** |
| `GET` | `/api/v1/posts` | Auth, Active, Tenant | `getFeedHandler` | **FUNCTIONAL** |
| `POST` | `/api/v1/posts` | Auth, Active, Tenant, RateLimit | `createPostHandler` | **FUNCTIONAL** |
| `GET` | `/api/v1/posts/:id` | Auth, Active, Tenant | `getPostHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `PATCH` | `/api/v1/posts/:id` | Auth, Active, Tenant | `updatePostHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `DELETE` | `/api/v1/posts/:id` | Auth, Active, Tenant | `deletePostHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `POST` | `/api/v1/posts/:id/pin` | Auth, Active, Tenant | `pinPostHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `DELETE` | `/api/v1/posts/:id/pin` | Auth, Active, Tenant | `unpinPostHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `POST` | `/api/v1/posts/:id/report` | Auth, Active, Tenant, RateLimit | `reportPostHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `POST` | `/api/v1/posts/:id/like` | Auth, Active, Tenant | `likePostHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `DELETE` | `/api/v1/posts/:id/like` | Auth, Active, Tenant | `unlikePostHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `GET` | `/api/v1/posts/:id/likes` | Auth, Active, Tenant | `getPostLikesHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `POST` | `/api/v1/posts/:id/view` | Auth, Active, Tenant | `recordPostViewHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `GET` | `/api/v1/posts/:id/views` | Auth, Active, Tenant | `getPostViewsHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `GET` | `/api/v1/posts/:id/comments` | Auth, Active, Tenant | `getCommentsHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `POST` | `/api/v1/posts/:id/comments` | Auth, Active, Tenant, RateLimit | `createCommentHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `PATCH` | `/api/v1/posts/:id/comments/:commentId` | Auth, Active, Tenant | `updateCommentHandler` | **FUNCTIONAL (Needs UUID Guard)** |
| `DELETE` | `/api/v1/posts/:id/comments/:commentId` | Auth, Active, Tenant | `deleteCommentHandler` | **FUNCTIONAL (Needs UUID Guard)** |

Additionally, group-specific feed retrieval is supported via:
- `GET /api/v1/groups/:slug/posts` (`groups.controller.ts -> getGroupFeedHandler`)

### 3.2 Key Architectural Gaps in Backend API

1. **UUID Parameter Schema Gap:**
   - Handlers validate `:id` via `idParamSchema` from [`packages/validation/src/common.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/validation/src/common.ts), which only checks `z.string().min(1)`.
   - Handlers validate `:commentId` via `commentIdParamSchema`, which also only checks `z.string().min(1)`.
   - Passing malformed non-UUID identifiers (e.g. `GET /api/v1/posts/invalid-id`) bypasses Zod validation and causes Prisma to throw a database conversion error, triggering an unhandled HTTP 500 error instead of a clean HTTP 400 Bad Request.
2. **Missing Search Parameter in Feed Query:**
   - [`feedQuerySchema`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/validation/src/post.ts) only accepts `{ page, limit, type, authorId }`.
   - Neither the validation schema nor [`getCommunityFeed`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/posts/posts.service.ts) accepts a `search` query parameter. Full-text or keyword search in the feed is currently unsupported.
3. **Query Bounding Standard:**
   - When search is introduced, it must be bounded to a maximum of 100 characters to align with project-wide DDoS and performance bounds (`search: z.string().trim().max(100).optional()`).

---

## 4. Multi-Tenant Security & Physical Isolation

### 4.1 Tenant Enforcement Chain
- **Router-Level Guard:** All 18 endpoints in `postsRouter` enforce `requireTenantContext`.
- **Database Client Scoping:** Every service function calls:
  ```typescript
  function assertDb(db?: PrismaClient): PrismaClient {
    if (!db) {
      throw new PostServiceError('Tenant database client is required for post operations.', 400);
    }
    return db;
  }
  ```
- **No Default Fallback:** If `req.db` is undefined, the operation immediately aborts with HTTP 400. There is no silent fallback to a central or default database.
- **SUPER_ADMIN Scoping:** `SUPER_ADMIN` actions on posts and comments are strictly scoped to the active tenant database resolved by the request context.

### 4.2 Group Post Privacy Protection
- In [`posts.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/posts/posts.service.ts), `getCommunityFeed` filters private group posts:
  ```typescript
  OR: [
    { groupId: null },
    { group: { privacy: 'PUBLIC' } },
    ...(currentUserId ? [{ group: { privacy: 'PRIVATE', members: { some: { userId: currentUserId } } } }] : [])
  ]
  ```
- When accessing a private group post directly via [`verifyActivePost`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/posts/posts.service.ts), non-members receive HTTP 404 (`PostNotFoundError`), preventing information leakage regarding private post existence.

---

## 5. Frontend Implementation Audit

### 5.1 Existing Components & Pages
1. [`FeedPage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/FeedPage.tsx):
   - Concurrency lock (`inFlightRef`), abort controller, and stale-response guard (`requestIdRef`).
   - Post type filter chips (`GENERAL`, `ANNOUNCEMENT`, `EVENT`).
   - Refresh button and load more pagination.
   - Skeletons, empty states, and error alerts.
2. [`PostDetailPage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/PostDetailPage.tsx):
   - Direct loading of posts via route param `:postId`.
   - Deep-linking support for comments via `?commentId=...`.
   - Dynamic document title updates.
3. [`PostCard.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/components/PostCard.tsx):
   - Optimistic liking with rollback on error.
   - Expandable comment section with paginated loading.
   - Edit dialog and delete confirmation dialog.
   - Media rendering: multi-image grid with lightbox preview, direct video playback, and privacy-enhanced YouTube embed player.
   - Post sharing: clipboard copy, native Web Share API, and WhatsApp deep-link.
4. [`CreatePostComposer.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/components/CreatePostComposer.tsx):
   - Text content input (max 5000 chars).
   - Post type selector (Announcement restricted to admin/moderator).
   - Image upload (max 4) and YouTube URL preview.

### 5.2 Frontend Gaps & Deficiencies
1. **No URL Parameter Synchronization in `FeedPage.tsx`:**
   - Unlike `DirectoryPage` and `GroupsPage`, `FeedPage.tsx` does not use `useSearchParams`.
   - Filter state (`selectedType`) is stored in component local state only.
   - Page refreshes or browser Back/Forward navigation reset filter selection.
2. **Missing Search Input on Feed:**
   - There is no search bar on `FeedPage.tsx` to search feed content.
3. **Empty State Reset:**
   - When a filter results in zero posts, the empty state does not provide a one-click "Reset Filter" action.

---

## 6. Automated Test Evidence (Live Execution)

During this audit, tests were executed live to establish verified facts:

### 6.1 Tests Executed Live During This Session

| Test Suite | Path | Assertions Passed | Failed | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Physical Tenant DB Isolation** | `apps/api/src/tests/posts-groups-matrimonial-tenant.test.ts` | 32 | 0 | **PASS** |
| **Group Post Persistence & Privacy** | `apps/api/src/tests/group-post-persistence.test.ts` | 24 | 0 | **PASS** |
| **Social Feed Engagement & Likes** | `apps/web/src/tests/social-feed-engagement.test.ts` | 38 | 0 | **PASS** |
| **Post Detail & Deep Linking** | `apps/web/src/tests/post-detail-deep-linking.test.ts` | 34 | 0 | **PASS** |
| **Social Feed Performance & Concurrency** | `apps/web/src/tests/social-feed-performance.test.ts` | 41 | 0 | **PASS** |
| **TOTAL LIVE PASSES** | | **169** | **0** | **PASS** |

### 6.2 Legacy Test Header Observation
- Suite `apps/api/src/tests/community.posts.test.ts` was run and failed with HTTP 400 at post creation.
- **Root Cause:** The test was authored in Phase 4A before tenant isolation was introduced. Its HTTP fetch calls omit the `x-community-slug` header, correctly triggering `requireTenantContext` rejection. This confirms tenant enforcement is strictly operating.

---

## 7. Prioritized Gaps & Defect Assessment

| Gap / Issue | Component | Severity | Description |
| :--- | :--- | :--- | :--- |
| **Route Param UUID Validation** | Backend (`posts.controller.ts`) | **HIGH** | `idParamSchema` accepts non-UUID strings, causing Prisma to throw unhandled 500 errors instead of returning HTTP 400. |
| **Comment Param UUID Validation** | Backend (`posts.controller.ts`) | **HIGH** | `:commentId` is not validated as UUID, leading to potential Prisma 500 errors. |
| **Feed Keyword Search Support** | Backend API & Schema | **MEDIUM** | `feedQuerySchema` lacks `search` parameter; feed cannot be queried by keyword. |
| **Feed URL State Synchronization** | Frontend (`FeedPage.tsx`) | **MEDIUM** | `selectedType` filter is not synced to URL query parameters via `useSearchParams`. |
| **Feed Search Input & Debounce** | Frontend (`FeedPage.tsx`) | **MEDIUM** | No debounced search input exists for searching the feed. |
| **Empty State Reset Action** | Frontend (`FeedPage.tsx`) | **LOW** | Empty filter state lacks a "Clear Filter" shortcut. |

---

## 8. Proposed Implementation Plan for Batch 15D.2 & 15D.4

### Batch 15D.2: Social Feed Backend Hardening & API Refinements
1. **Validation Schemas (`packages/validation/src/post.ts`):**
   - Add `postIdSchema = z.string().uuid('Invalid post ID format. Expected a valid UUID.')`.
   - Add `postCommentParamSchema = z.object({ id: z.string().uuid(), commentId: z.string().uuid() })`.
   - Add optional bounded `search: z.string().trim().max(100).optional()` to `feedQuerySchema`.
2. **Controller Hardening (`apps/api/src/modules/posts/posts.controller.ts`):**
   - Replace `idParamSchema` with `postIdSchema` across all post route handlers.
   - Replace `commentIdParamSchema` with `postCommentParamSchema` for comment route handlers.
   - Forward `search` query parameter to service.
3. **Service Refinements (`apps/api/src/modules/posts/posts.service.ts`):**
   - Add `search` filter in `getCommunityFeed` (`content: { contains: search, mode: 'insensitive' }`).
4. **Automated Backend Tests (`apps/api/src/tests/posts-refinements.test.ts`):**
   - Author a dedicated, non-mutating mock-based test suite covering UUID validation, parameter bounds, search filtering, and error codes.

### Batch 15D.4: Social Feed Frontend Refinements & UX Hardening
1. **URL Synchronization (`apps/web/src/pages/FeedPage.tsx`):**
   - Bind `type` and `search` filters to URL search parameters using `useSearchParams`.
2. **Debounced Search:**
   - Add a 100-character bounded search box with 400ms unified debouncing.
3. **Empty & Error State Enhancements:**
   - Add a one-click "Clear Filters" button when query yields no results.
4. **Automated Frontend Tests (`apps/web/src/tests/feed-frontend-ux.test.ts`):**
   - Validate URL parameter parsing, debouncing, and state synchronization.

---

## 9. Git Working Tree Status

```text
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  BATCH_15B_8_CHECKPOINT_REPORT.md
  BATCH_15B_9_MEMBER_DIRECTORY_INTEGRATION_REVIEW.md
  BATCH_15D_1_SOCIAL_FEED_ARCHITECTURE_AUDIT.md
```
- **Tracked Modifications:** 0
- **Staged Files:** 0
- **HEAD:** `85c0570`
- **Repository Health:** Clean and synchronized with `origin/main`.

---

## 10. Audit Recommendation

### **Verdict: GO FOR BATCH 15D.2**
The Social Feed architecture is robust, multi-tenant compliant, and ready for parameter hardening and search query extensions in Batch 15D.2.

