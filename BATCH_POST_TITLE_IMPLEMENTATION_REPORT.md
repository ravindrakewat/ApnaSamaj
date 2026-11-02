# Batch Implementation Report: Post Title & Structured Content

**Date:** November 2, 2026  
**Repository:** `https://github.com/ravindrakewat/ApnaSamaj.git`  
**Current Branch:** `main`  
**Base Commit / HEAD:** `247fb6d7ad4fe5bca836ef4997ec7d7c58e14313` (`247fb6d`)  
**Status:** ✅ Successfully Implemented, Tested, and Verified Clean

---

## 1. Executive Summary

This batch implements **Post Title & Structured Content** across the Apna Samaj monorepo while maintaining 100% backward compatibility, Hindi/English localization parity, multi-tenant isolation, direct video upload, YouTube embedding, and photo attachments.

### Key Deliverables:
1. **Architectural Gap Analysis & Reporting:**
   - Identified that the Prisma database schema and shared types enum `PostType` historically contains only `GENERAL`, `ANNOUNCEMENT`, and `EVENT`.
   - Reported the gap that `EMPLOYMENT` and `GOVERNMENT_SCHEME` do not exist in the active database schema or enum definitions. Structured content validation was safely implemented for all supported types (`GENERAL` optional, `ANNOUNCEMENT` required, `EVENT` required) without breaking runtime database constraints or causing schema drift.
2. **Database Schema & Migration Artifact:**
   - Updated `packages/database/prisma/schema.prisma` to add `title String?` to `model Post`.
   - Created safe migration SQL artifact in `packages/database/prisma/migrations/20261102193000_add_post_title/migration.sql` (`ALTER TABLE "Post" ADD COLUMN "title" TEXT;`).
   - Regenerated Prisma client via `npx prisma generate` without executing migrations against live/staging databases.
3. **Shared Types Contract:**
   - Updated `packages/shared-types/src/post.ts`:
     - Added `title?: string | null;` to `PostItem`.
     - Added `title?: string | null;` to `CreatePostRequest`.
     - Added `title?: string | null;` to `UpdatePostRequest`.
     - Added `title?: string | null;` to `ModerationQueueItem.post`.
4. **Zod Validation Schemas:**
   - In `packages/validation/src/post.ts`:
     - `createPostSchema`: Enforces max 150 characters for `title`. When `type === 'ANNOUNCEMENT' || type === 'EVENT'`, `title` is required (rejects empty/whitespace-only). When `type === 'GENERAL'`, `title` is optional.
     - `updatePostSchema`: Enforces max 150 characters for `title`. When `type === 'ANNOUNCEMENT' || type === 'EVENT'` and `title` is supplied, `title` must be non-empty. Accepts partial updates for title alone.
5. **API Service Implementation:**
   - Updated `apps/api/src/modules/posts/posts.service.ts`:
     - `createPost`: Persists `title: input.title !== undefined ? (input.title?.trim() || null) : null`.
     - `updatePost`: Updates `title` when provided in input.
     - `mapToPostItem`: Maps `title: post.title ?? null` ensuring backward compatibility with legacy posts lacking a title.
     - `getCommunityFeed`: Enhanced search filter to query `title` (case-insensitive) alongside `content` and author `fullName`.
6. **Hindi & English Localization (100% Key Parity):**
   - Added 10 new title-related translation keys across `packages/i18n/src/locales/en/feed.json` and `packages/i18n/src/locales/hi/feed.json`.
   - Zero hardcoded user-facing strings; all labels, placeholders, character counters, and error hints translate cleanly and preserve user content.
7. **Frontend Web UI Components:**
   - `CreatePostComposer.tsx`: Added `title` input with dynamic placeholder based on post type, required asterisk/hint for Announcement/Event, 150-char counter, submit validation, and state reset.
   - `PostCard.tsx`: Displays bold post title heading (`Typography variant="h6" component="h3"`) above description text with responsive word wrapping. Added title editing to the Edit Post Dialog. Localized `postTypeLabel`.
   - `PostDetailPage.tsx`: Automatically inherits post title rendering from `PostCard`, and prioritizes `post.title || post.content` in dynamic `document.title`.

---

## 2. Architectural Gap Analysis: Post Types

| Post Type | User Target Requirement | Database Enum Status | Resolution / Action Taken |
| :--- | :--- | :--- | :--- |
| **General Post** (`GENERAL`) | Title is **Optional** | Supported | Enforced in `createPostSchema`: Title is optional. |
| **Announcement** (`ANNOUNCEMENT`) | Title is **Required** | Supported | Enforced in `createPostSchema` & `updatePostSchema`: Rejects empty/whitespace strings. |
| **Event** (`EVENT`) | Title is **Required** | Supported | Enforced in `createPostSchema` & `updatePostSchema`: Rejects empty/whitespace strings. |
| **Employment** | Title is Required | **GAP:** Enum does not exist in DB | Reported gap per Section 3 instructions. Do not introduce incompatible enum until database enum migration is scheduled. |
| **Government Scheme** | Title is Required | **GAP:** Enum does not exist in DB | Reported gap per Section 3 instructions. Do not introduce incompatible enum until database enum migration is scheduled. |

---

## 3. Localization Parity Table (`feed.json`)

| Translation Key | English (`en/feed.json`) | Hindi (`hi/feed.json`) | Purpose |
| :--- | :--- | :--- | :--- |
| `postTitleLabel` | `Post Title` | `पोस्ट का शीर्षक` | Input field label |
| `postTitlePlaceholder` | `Enter a title for this post...` | `इस पोस्ट के लिए एक शीर्षक दर्ज करें...` | General post placeholder |
| `postTitleAnnouncementPlaceholder` | `e.g. Important Samaj Announcement...` | `उदा. समाज की महत्वपूर्ण घोषणा...` | Announcement placeholder |
| `postTitleEventPlaceholder` | `e.g. Annual Community Gathering 2026...` | `उदा. वार्षिक समाज सम्मेलन २०२६...` | Event placeholder |
| `titleRequiredError` | `Title is required for this post type.` | `इस पोस्ट प्रकार के लिए शीर्षक अनिवार्य है।` | Validation error message |
| `titleMaxLengthError` | `Post title must not exceed 150 characters.` | `पोस्ट का शीर्षक 150 अक्षरों से अधिक नहीं हो सकता।` | Length error message |
| `postTypeLabel` | `Post Type` | `पोस्ट प्रकार` | Dropdown selector label |
| `postTitleOptionalHint` | `Optional` | `वैकल्पिक` | Helper text indicator |
| `postTitleRequiredHint` | `Required` | `अनिवार्य` | Helper text indicator |
| `postTitleCharsLeft` | `{{count}} chars left` | `{{count}} अक्षर शेष` | Character counter |

Key count in `feed.json`: 174 keys in `en`, 174 keys in `hi` (100% parity verified).

---

## 4. Verification and Test Results

### Automated Test Suites Executed:
1. **`apps/web/src/tests/post-title-ux.test.ts` (NEW):**
   - 26 tests passed (100% success):
     - English and Hindi feed namespaces contain all title keys
     - 100% key parity maintained
     - Dynamic language switching accurately resolves title strings
     - GENERAL post without title is valid
     - GENERAL post with valid title is valid
     - GENERAL post with title alone is valid
     - ANNOUNCEMENT post without title is rejected
     - ANNOUNCEMENT post with whitespace-only title is rejected
     - ANNOUNCEMENT post with non-empty title is accepted
     - EVENT post without title is rejected
     - EVENT post with whitespace-only title is rejected
     - EVENT post with non-empty title is accepted
     - Post title exceeding 150 characters is rejected
     - Post with exactly 150 character title is accepted
     - Empty post (no title, empty content, no media) is rejected
     - Updating post title alone is accepted
     - Updating ANNOUNCEMENT post with empty title is rejected
     - Updating EVENT post with non-empty title is accepted
     - Updating title exceeding 150 characters is rejected
     - Legacy posts without title field map safely to null
     - User-generated title in Hindi remains untouched (zero translation)
     - Post with title and photo attachment is accepted
     - Post with title and direct uploaded video is accepted
     - Post with title and YouTube video embed is accepted
     - Title post enforcing at most 1 video still works
     - PostType enum contains strictly GENERAL, ANNOUNCEMENT, EVENT
2. **`apps/web/src/tests/feed-localization-ux.test.ts`:**
   - 25 / 25 tests passed
3. **`apps/web/src/tests/directory-localization-ux.test.ts`:**
   - 14 / 14 tests passed
4. **`apps/web/src/tests/groups-localization-ux.test.ts`:**
   - 15 / 15 tests passed
5. **`apps/api/src/tests/direct-video-upload.test.ts`:**
   - 35 / 35 tests passed
6. **Total Automated Assertions:** **115 Passed, 0 Failed.**

### Monorepo Typecheck & Build Verification:
- `npm run typecheck --workspaces --if-present`:
  - `@apnasamaj/admin`: `tsc --noEmit` clean
  - `@apnasamaj/api`: `tsc --noEmit` clean
  - `@apnasamaj/web`: `tsc --noEmit` clean
  - `@apnasamaj/database`: `tsc --noEmit` clean
  - `@apnasamaj/i18n`: `tsc --noEmit` clean
  - `@apnasamaj/shared-types`: `tsc --noEmit` clean
  - `@apnasamaj/ui-config`: `tsc --noEmit` clean
  - `@apnasamaj/validation`: `tsc --noEmit` clean
- `npm run build --workspace=@apnasamaj/web`:
  - `tsc && vite build` built in 14.09s, generating optimized production bundles.

---

## 5. Modified & Created Files

```text
M apps/api/src/modules/posts/posts.service.ts
M apps/api/src/tests/direct-video-upload.test.ts
M apps/web/src/components/CreatePostComposer.tsx
M apps/web/src/components/PostCard.tsx
M apps/web/src/pages/PostDetailPage.tsx
M packages/database/prisma/schema.prisma
M packages/i18n/src/locales/en/feed.json
M packages/i18n/src/locales/hi/feed.json
M packages/shared-types/src/post.ts
M packages/validation/src/post.ts
?? packages/database/prisma/migrations/20261102193000_add_post_title/migration.sql
?? apps/web/src/tests/post-title-ux.test.ts
?? BATCH_POST_TITLE_IMPLEMENTATION_REPORT.md
```

All existing uncommitted changes from Batch 15H.1 (Directory localization) and Batch 15H.2 (Groups localization) were strictly preserved.

---

## 6. Git & Multi-Tenant Compliance

- **No Staging / Committing:** No `git add .` or `git commit` executed.
- **No Push / Deployment:** No `git push` or remote calls executed.
- **Database Safety:** Migration file prepared as artifact; zero migrations executed against live or staging databases.
- **Physical Multi-Tenancy Invariant:** Tenant scoping (`assertDb(req.db)`) strictly preserved across all post operations.
- **Data Privacy & Zero Exposure:** No sensitive user credentials, password hashes, or reset tokens exposed.

