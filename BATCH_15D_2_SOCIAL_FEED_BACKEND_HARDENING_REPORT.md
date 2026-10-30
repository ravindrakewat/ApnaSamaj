# Batch 15D.2: Social Feed Backend Hardening & API Refinements Report

**Date:** October 30, 2026  
**Auditor / Engineer:** Senior Backend Engineer & Application Security Engineer  
**Repository:** `ravindrakewat/ApnaSamaj`  
**Current Branch:** `main`  
**Base Commit (HEAD):** `85c0570a33b3fc23a1b848fd7f2d66e0752d313b` (`85c0570`)  
**Status:** COMPLETE (Backend Hardening Implemented & Verified)

---

## 1. Executive Summary

In Batch 15D.2, the Social Feed backend was hardened across validation, routing, controller guards, query construction, and shared contracts to resolve the high-priority parameter validation vulnerability identified during the Batch 15D.1 architecture audit and to introduce keyword search capabilities.

### Key Deliverables Completed:
1. **RFC 4122 UUID Parameter Schema Validation:** Replaced generic `idParamSchema` (`z.string().min(1)`) with dedicated `postIdSchema` and `postCommentIdSchema` across all 15 post and comment parameter handlers in [`posts.controller.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/posts/posts.controller.ts). Malformed or non-UUID route parameters now return HTTP 400 Bad Request with clear validation issues, preventing unhandled Prisma database conversion errors (HTTP 500).
2. **Feed Keyword Search Implementation:** Extended [`feedQuerySchema`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/validation/src/post.ts) to accept an optional `search` parameter, strictly trimmed and bounded to 100 characters max. Updated [`getCommunityFeed`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/posts/posts.service.ts) to filter on post text `content` and author `fullName` using case-insensitive mode.
3. **Security Invariant Preservation:** Search filters are combined with private-group privacy rules using `where.AND = [privacyFilter, searchFilter]`. Inaccessible private group posts remain hidden from non-members even if search keywords match.
4. **Physical Tenant Scoping:** All operations continue to enforce `requireTenantContext` and resolve via `assertDb(req.db)`. No fallback to default/central databases exists.
5. **Zero Breaking Changes:** Web API client [`getFeedApi`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/services/posts.service.ts) was enhanced in a 100% backwards-compatible manner.
6. **Automated Verification:** 209 total test assertions executed live across 6 test suites with 0 failures. Monorepo typecheck and production builds verified clean with 0 errors.

---

## 2. Files Changed

### Application Source & Packages (5 files modified)
1. [`packages/validation/src/post.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/validation/src/post.ts)
   - Exported `postIdSchema`: `z.string().uuid('Invalid post ID format. Expected a valid UUID.')`.
   - Exported `commentIdSchema`: `z.string().uuid('Invalid comment ID format. Expected a valid UUID.')`.
   - Exported `postCommentIdSchema`: validates `{ id: UUID, commentId: UUID }`.
   - Updated `feedQuerySchema`: added `search: z.string().trim().max(100, 'Search query cannot exceed 100 characters.').optional()`.
   - Re-exported inferred TypeScript types: `PostIdParam`, `SingleCommentIdParam`, `PostCommentIdParam`.
2. [`packages/shared-types/src/post.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/shared-types/src/post.ts)
   - Exported `FeedQueryParams` interface representing feed filter options.
3. [`apps/api/src/modules/posts/posts.controller.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/posts/posts.controller.ts)
   - Updated all 15 route parameter handlers to validate with `postIdSchema.safeParse(req.params.id)` and `postCommentIdSchema.safeParse(req.params)`.
   - Handlers updated: `getPostHandler`, `updatePostHandler`, `deletePostHandler`, `pinPostHandler`, `unpinPostHandler`, `reportPostHandler`, `likePostHandler`, `unlikePostHandler`, `getPostLikesHandler`, `recordPostViewHandler`, `getPostViewsHandler`, `getCommentsHandler`, `createCommentHandler`, `updateCommentHandler`, `deleteCommentHandler`.
4. [`apps/api/src/modules/posts/posts.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/posts/posts.service.ts)
   - Extracted `search` from `query` in `getCommunityFeed`.
   - Constructed `searchFilter` querying `content` and `author.profile.fullName`.
   - Encapsulated `privacyFilter` and `searchFilter` under `where.AND` when search is active, preserving `where.OR` when search is absent.
5. [`apps/web/src/services/posts.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/services/posts.service.ts)
   - Extended `getFeedApi` to accept `search?: string` while retaining backwards compatibility for callers passing options as the 5th argument.

### Automated Tests (1 file created)
6. [`apps/api/src/tests/posts-refinements.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/posts-refinements.test.ts)
   - 40 focused assertions covering UUID validation, feed search query bounds, controller parameter guards, and tenant database failsafe behavior.

---

## 3. UUID Route Parameter Validation Changes

### 3.1 Problem Solved
Previously, all post and comment handlers used `idParamSchema` from `packages/validation/src/common.ts`, which defined `z.string().min(1)`. This permitted arbitrary strings (e.g. `invalid-id`, SQL injection strings) to reach Prisma queries. Prisma would fail to cast the string to a PostgreSQL `uuid` column, throwing an unhandled exception and returning an HTTP 500 Internal Server Error.

### 3.2 Implemented Schema Invariants
- **`postIdSchema`:** Validates that `req.params.id` adheres to RFC 4122 UUID syntax.
- **`postCommentIdSchema`:** Validates that both `req.params.id` and `req.params.commentId` are valid UUIDs.
- **Failsafe Response:**
  ```json
  {
    "success": false,
    "error": "Invalid post ID format. Expected a valid UUID.",
    "timestamp": "2026-10-30T22:00:00.000Z"
  }
  ```
  Returns HTTP 400 Bad Request immediately without executing database queries.
- **Generic 404 for Missing Resources:** If a post ID is a valid UUID but does not exist in the database, the service continues to return HTTP 404 (`PostNotFoundError`), preventing resource existence leaks.

---

## 4. Feed Keyword Search Implementation & API Contract

### 4.1 Schema Contract (`feedQuerySchema`)
```typescript
export const feedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  type: postTypeEnum.optional(),
  authorId: z.string().uuid('Invalid author ID').optional(),
  search: z.string().trim().max(100, 'Search query cannot exceed 100 characters.').optional(),
});
```

### 4.2 Query Logic in `getCommunityFeed`
```typescript
  // Exclude posts from PRIVATE groups unless caller is an active member
  const privacyFilter = {
    OR: [
      { groupId: null },
      { group: { privacy: 'PUBLIC' } },
      ...(currentUserId
        ? [{ group: { privacy: 'PRIVATE', members: { some: { userId: currentUserId } } } }]
        : []),
    ],
  };

  const trimmedSearch = search?.trim();
  if (trimmedSearch && trimmedSearch.length > 0) {
    const searchFilter = {
      OR: [
        { content: { contains: trimmedSearch, mode: 'insensitive' } },
        { author: { profile: { fullName: { contains: trimmedSearch, mode: 'insensitive' } } } },
      ],
    };
    where.AND = [privacyFilter, searchFilter];
  } else {
    where.OR = privacyFilter.OR;
  }
```

### 4.3 Search Invariants
- **Case-Insensitive:** Uses PostgreSQL `mode: 'insensitive'` for flexible searching.
- **Trimmed & Bounded:** Whitespace is trimmed and queries exceeding 100 characters are rejected with HTTP 400.
- **Empty Query Fallback:** Empty strings (`""`) or whitespace-only queries (`"   "`) are safely treated as no search filter.
- **Privacy Enforcement:** Search matches are strictly combined with the group privacy filter under `where.AND`. Non-members cannot search or view private group posts.

---

## 5. Multi-Tenant Security & Authorization Review

| Security Invariant | Verification Status | Notes |
| :--- | :--- | :--- |
| **Authentication Enforcement** | **PASS** | `postsRouter.use(authenticateToken, requireActiveUser, requireTenantContext)` applied across all routes. |
| **Tenant Database Scoping** | **PASS** | `assertDb(req.db)` executed at entry point of every service function. Throws HTTP 400 if tenant DB is missing. |
| **No Default DB Fallback** | **PASS** | No fallback to central or default databases exists. |
| **SUPER_ADMIN Boundary** | **PASS** | Operations run against caller's tenant database context. Physical boundaries are maintained. |
| **Private Group Invariant** | **PASS** | Non-members receive HTTP 404 when directly requesting private posts via `verifyActivePost`, and feed search strictly excludes them. |
| **Sensitive Field Sanitization** | **PASS** | `phone`, `passwordHash`, `dateOfBirth`, internal tokens are excluded from all author and comment profiles. |

---

## 6. Automated Test Evidence (Live Execution)

All 6 test suites below were executed live during Batch 15D.2 and passed 100%:

| Test Suite Name | File Path | Assertions | Status |
| :--- | :--- | :--- | :--- |
| **Posts Refinements & Parameter Guards** | `apps/api/src/tests/posts-refinements.test.ts` | **40 / 40** | **PASS** |
| **Physical Tenant DB Isolation** | `apps/api/src/tests/posts-groups-matrimonial-tenant.test.ts` | **32 / 32** | **PASS** |
| **Group Post Persistence & Privacy** | `apps/api/src/tests/group-post-persistence.test.ts` | **24 / 24** | **PASS** |
| **Social Feed Engagement & Likes** | `apps/web/src/tests/social-feed-engagement.test.ts` | **38 / 38** | **PASS** |
| **Post Detail & Deep Linking** | `apps/web/src/tests/post-detail-deep-linking.test.ts` | **34 / 34** | **PASS** |
| **Social Feed Performance & Concurrency** | `apps/web/src/tests/social-feed-performance.test.ts` | **41 / 41** | **PASS** |
| **TOTAL LIVE ASSERTIONS** | | **209 / 209** | **100% PASS** |

### 6.1 Monorepo Typecheck & Build Results
- **`npm run typecheck` (`tsc --noEmit` across all workspaces):** **PASSED (0 errors, exit 0)**
- **`npm run build` (Production compilation across all workspaces):** **PASSED (0 errors, exit 0)**
  - `@apnasamaj/admin`: Built in 10.81s (Vite v5.4.21)
  - `@apnasamaj/api`: Built clean (`tsc`)
  - `@apnasamaj/web`: Built in 12.83s (Vite v5.4.21)
  - Packages (`database`, `shared-types`, `ui-config`, `validation`): Built clean (`tsc`)

---

## 7. Database & Schema Confirmation

- **Database Migrations:** None executed.
- **Prisma Schema Changes:** None made.
- **Production Data Writes:** None occurred.
- All searchable fields (`Post.content`, `User.profile.fullName`) already exist in the schema and required zero database mutations.

---

## 8. Git Working Tree Status

```text
Changes not staged for commit:
  modified:   apps/api/src/modules/posts/posts.controller.ts
  modified:   apps/api/src/modules/posts/posts.service.ts
  modified:   apps/web/src/services/posts.service.ts
  modified:   packages/shared-types/src/post.ts
  modified:   packages/validation/src/post.ts

Untracked files:
  BATCH_15B_8_CHECKPOINT_REPORT.md
  BATCH_15B_9_MEMBER_DIRECTORY_INTEGRATION_REVIEW.md
  BATCH_15D_1_SOCIAL_FEED_ARCHITECTURE_AUDIT.md
  BATCH_15D_2_SOCIAL_FEED_BACKEND_HARDENING_REPORT.md
  apps/api/src/tests/posts-refinements.test.ts
```
- **Staged Files:** 0
- **Modified Tracked Files:** 5
- **Untracked Files:** 5

---

## 9. Next Steps

The backend hardening is complete and fully verified. The repository is in a clean, stable state for **Batch 15D.3: Social Feed Git Safety Audit & Checkpoint Preparation**.

