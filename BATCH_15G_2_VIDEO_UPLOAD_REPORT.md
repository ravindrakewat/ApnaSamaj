# Apna Samaj — Batch 15G.2 Implementation & Verification Report
## Direct Video Upload + YouTube Video Integration

**Date:** 2026-11-02  
**Status:** **Completed & Verified**  
**Repository Branch:** `main`  
**Base HEAD:** `58493f74b1724b80433ebe59b0ba08cc5b6cd4b1` (`58493f7`)  
**Git Safety Preserved:** 0 files staged, 0 commits created, 0 pushes executed, 0 migrations run.

---

## 1. Executive Summary

Batch 15G.2 successfully implemented authenticated **Direct Video Uploads** to the Apna Samaj Community Social Feed while strictly preserving existing **YouTube Video Embedding**, **Photo Uploads**, and the **HTML5 Video Player** in `PostCard.tsx`.

### Core Engineering Accomplishments:
1. **Zero Database Migrations:** Utilized the existing Prisma `PostMedia` model (`mediaType MediaType @default(IMAGE)`, `url`, `thumbnail`, `order`) and `enum MediaType { IMAGE, VIDEO, DOCUMENT }`.
2. **Memory Safety & Anti-OOM Architecture:** Avoided `multer.memoryStorage()` entirely for video uploads. Implemented `multer.diskStorage()` writing temporary files to a dedicated temporary directory (`os.tmpdir()/apnasamaj-video-uploads`) with guaranteed disk cleanup in a `finally` block.
3. **Server-Side File Signature (Magic Bytes) Validation:** Video files are validated by reading only the first 128 bytes from disk using `detectVideoMimeTypeFromDisk`. MP4 files are confirmed via the ISO BMFF `ftyp` box (offset 4..7), and WebM files are confirmed via the EBML ID (`0x1A 0x45 0xDF 0xA3`) and `webm` DocType string. Fake extensions (e.g. text files renamed to `.mp4`) and non-WebM containers (e.g. MKV) are strictly rejected.
4. **Storage Integration & Bucket Update:** Updated the Supabase Storage bucket (`post-media`) configuration via `updateBucket` to allow `video/mp4` and `video/webm` alongside existing images with a 50MB bucket limit. Added automated fallback to mock storage in environments where Supabase credentials are not locally configured.
5. **Frontend Composer Enhancements:** Added a video file picker, video preview card with file size (`MB`) and duration (`mm:ss`) chips, real upload progress tracking via `XMLHttpRequest.upload.onprogress`, inline error alerts with 1-click retry, and mutual exclusivity between direct video and YouTube embeds.
6. **Bilingual Localization:** Registered 17 new video translation keys in both English (`en/feed.json`) and Hindi (`hi/feed.json`) with 100% key parity (164 total keys).
7. **Comprehensive Test Suites:** Authored and verified 80 new automated tests (35 backend + 45 frontend) plus 25 localization tests from Batch 15G.1 (**105 / 105 PASS**). 100% clean TypeScript typechecks across all 8 monorepo workspaces and successful production build of `apps/web`.

---

## 2. Architecture & Invariants Enforced

### A. Community & Multi-Tenant Isolation
- The video upload endpoint (`POST /api/v1/posts/media/video-upload`) is mounted on `postsRouter` and guarded by:
  - `authenticateToken`: Verifies valid JWT bearer token and reloads user from tenant DB.
  - `requireActiveUser`: Rejects `PENDING` accounts with HTTP 403 and `SUSPENDED` accounts with HTTP 403.
  - `requireTenantContext`: Rejects requests lacking a verified community tenant context (`X-Community-Slug` or subdomain) with HTTP 400.
  - `uploadVideoRateLimiter`: Enforces IP-based rate limiting (10 video uploads per 15 minutes).
- Storage objects are namespaced by user: `posts/${userId}/${uuid}.${ext}`, preventing path traversal and unauthorized file overwrites.
- Post creation persists video records exclusively to `req.db` using `assertDb(req.db)`.

### B. Size & Duration Bounds
- **Maximum File Size:** `30 MB` (`MAX_VIDEO_FILE_SIZE_BYTES = 30 * 1024 * 1024` bytes).
- **Maximum Duration:** `90 seconds` (`MAX_VIDEO_DURATION_SECONDS = 90`). Checked on the client via `HTMLVideoElement.onloadedmetadata` prior to network upload.
- **Allowed Formats:** Strictly `video/mp4` and `video/webm`.

### C. Mutual Exclusivity & Post Attachment Limits
- A post allows a maximum of 4 media attachments in total.
- At most 1 video is allowed per post (direct video or YouTube embed).
- In the UI:
  - Attaching a direct video disables the YouTube button and hides/disables additional video uploads.
  - Attaching a YouTube video disables the direct video button.
  - Attaching 4 photos disables both video buttons.
  - Attaching 1 direct video limits additional photos to at most 3.
- In the backend: `createPostSchema` enforces `videoCount <= 1` and `media.length <= 4`.

---

## 3. Files Created & Modified

| File | Action | Scope / Purpose |
|:---|:---:|:---|
| `packages/shared-types/src/post.ts` | Modified | Updated `UploadMediaResponseData.mediaType` to `'IMAGE' \| 'VIDEO' \| 'DOCUMENT'`. |
| `packages/validation/src/post.ts` | Modified | Exported `MAX_VIDEO_FILE_SIZE_BYTES`, `MAX_VIDEO_DURATION_SECONDS`, `ALLOWED_VIDEO_MIME_TYPES`, updated `postMediaItemSchema` to permit direct video URLs. |
| `packages/i18n/src/locales/en/feed.json` | Modified | Added 17 video translation keys (total 164 keys). |
| `packages/i18n/src/locales/hi/feed.json` | Modified | Added 17 authentic Hindi video translation keys (total 164 keys, 1:1 parity). |
| `apps/api/src/config/env.ts` | Modified | Added `maxVideoFileSizeBytes` (30 MB default) to `AppConfig`. |
| `apps/api/src/middleware/rate-limiter.ts` | Modified | Added `uploadVideoRateLimiter` (10 uploads / 15 min). |
| `apps/api/src/middleware/upload.middleware.ts` | Modified | Added `singleVideoUpload` using `multer.diskStorage()` with 30MB bound, video MIME filter, and uniform `ApiResponse` error formatting. |
| `apps/api/src/services/storage.service.ts` | Modified | Added `detectVideoMimeType`, memory-safe `detectVideoMimeTypeFromDisk` (first 128 bytes read), `uploadPostVideo` streaming from disk, and `updateBucket` support. |
| `apps/api/src/modules/posts/posts.controller.ts` | Modified | Added `uploadVideoHandler` with guaranteed `finally` cleanup of disk temporary files. |
| `apps/api/src/modules/posts/posts.routes.ts` | Modified | Registered `POST /api/v1/posts/media/video-upload` route. |
| `apps/web/src/utils/video.ts` | Created | Reusable `getVideoDuration` helper using HTML5 video metadata. |
| `apps/web/src/services/posts.service.ts` | Modified | Added `uploadPostVideoApi` with real `XMLHttpRequest` progress reporting. |
| `apps/web/src/components/CreatePostComposer.tsx` | Modified | Added video file input, "Video" toolbar button, video preview card with duration/size chips, progress bar, error alert with retry button, and mutual exclusivity. |
| `apps/api/src/tests/direct-video-upload.test.ts` | Created | 35 automated backend unit, security, disk cleanup, and HTTP tests. |
| `apps/web/src/tests/direct-video-composer.test.ts` | Created | 45 automated frontend unit, duration check, schema, and i18n tests. |
| `BATCH_15G_2_VIDEO_UPLOAD_REPORT.md` | Created | Comprehensive implementation and verification report. |
| `docs/PROJECT_HISTORY.md` | Modified | Updated Section E and Section F with verified Batch 15G.2 results. |

---

## 4. Verification & Automated Test Results

### Suite 1: Backend Direct Video Upload Tests
**Command:** `npx tsx apps/api/src/tests/direct-video-upload.test.ts`  
**Result:** **35 Passed, 0 Failed (100% Pass)**

Highlights:
- `MAX_VIDEO_FILE_SIZE_BYTES` is 30MB (31,457,280 bytes): **PASS**
- `MAX_VIDEO_DURATION_SECONDS` is 90 seconds: **PASS**
- Magic bytes detection of MP4 `ftyp` box: **PASS**
- Magic bytes detection of WebM EBML docType: **PASS**
- Rejection of spoofed text files disguised as `.mp4`: **PASS**
- Rejection of non-WebM matroska containers: **PASS**
- Rejection of short buffers under 12 bytes: **PASS**
- Memory-safe disk detection reading 128 bytes: **PASS**
- Empty video file rejection with `StorageError`: **PASS**
- Corrupted file rejection with `InvalidMimeTypeError`: **PASS**
- Storage upload public URL generation with user namespace: **PASS**
- HTTP 401 on unauthenticated request: **PASS**
- HTTP 403 on pending user request: **PASS**
- HTTP 400 on missing community tenant context: **PASS**
- HTTP 400 on non-video MIME type rejected by middleware: **PASS**
- HTTP 400 on spoofed text file rejected by magic bytes: **PASS**
- HTTP 201 Created on valid MP4 upload: **PASS**
- HTTP 201 Created on valid WebM upload: **PASS**
- Disk cleanup verified: **0 orphan files in `apnasamaj-video-uploads` temp dir**: **PASS**
- Post schema validation with 1 direct video: **PASS**
- Post schema validation with video alone (no text content): **PASS**
- Post schema validation blocking dual videos (1 direct + 1 YouTube): **PASS**
- Post schema validation allowing 1 video + 3 photos: **PASS**
- Post schema validation rejecting > 4 total media items: **PASS**

### Suite 2: Frontend Direct Video Composer & UX Tests
**Command:** `npx tsx apps/web/src/tests/direct-video-composer.test.ts`  
**Result:** **45 Passed, 0 Failed (100% Pass)**

Highlights:
- Video constraints (30MB, 90s, MP4/WebM): **PASS**
- `getVideoDuration` resolves on `onloadedmetadata`: **PASS**
- `getVideoDuration` rejects on `onerror`: **PASS**
- Post creation allows `.mp4` attachment: **PASS**
- Post creation allows `.webm` attachment: **PASS**
- Post creation blocks 2 videos: **PASS**
- Post creation allows 1 video + 3 photos: **PASS**
- Post creation rejects 1 video + 4 photos: **PASS**
- Translation keys present in both English and Hindi:
  - `composerVideo`: **PASS**
  - `composerVideoTooltip`: **PASS**
  - `composerVideoAttached`: **PASS**
  - `composerVideoAttachedTooltip`: **PASS**
  - `composerVideoDisabledTooltip`: **PASS**
  - `composerYoutubeDisabledTooltip`: **PASS**
  - `videoSizeExceeded`: **PASS**
  - `videoDurationExceeded`: **PASS**
  - `unsupportedVideoFormat`: **PASS**
  - `videoMetadataError`: **PASS**
  - `videoAttachedTitle`: **PASS**
  - `removeVideoAria`: **PASS**
  - `retryUpload`: **PASS**
  - `videoUploading`: **PASS**
  - `videoUploadingWait`: **PASS**
  - `videoUploadFailedRemoveOrRetry`: **PASS**
  - `videoPreviewAlt`: **PASS**

### Suite 3: Social Feed Localization & UX (Batch 15G.1 Regression)
**Command:** `npx tsx apps/web/src/tests/feed-localization-ux.test.ts`  
**Result:** **25 Passed, 0 Failed (100% Pass)**

### Suite 4: Monorepo Typecheck
**Command:** `npm run typecheck`  
**Result:** **Passed across all 8 workspaces with 0 errors:**
- `@apnasamaj/admin`: **PASS**
- `@apnasamaj/api`: **PASS**
- `@apnasamaj/web`: **PASS**
- `@apnasamaj/database`: **PASS**
- `@apnasamaj/i18n`: **PASS**
- `@apnasamaj/shared-types`: **PASS**
- `@apnasamaj/ui-config`: **PASS**
- `@apnasamaj/validation`: **PASS**

### Suite 5: Production Build Verification
- **`apps/web` (Member Portal):** `npm run build --workspace=@apnasamaj/web` completed in 19.77s with 0 errors. Chunks generated: `CreatePostComposer-B_h0-XnS.js` (20.98 kB), `PostCard-OkNyoIgB.js` (50.14 kB).
- **`apps/api` (Core Backend API):** `npx tsc -p apps/api/tsconfig.json` completed with 0 errors.

---

## 5. Storage Configuration & Live Status

- **Supabase Storage Bucket:** `post-media`
- **Updated Configuration:**
  - `public: true`
  - `fileSizeLimit: 52428800` (50 MB)
  - `allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']`
- **Verification:** Successfully executed live `updateBucket` against Supabase Storage, confirming that live uploads of `video/mp4` and `video/webm` are now accepted without error.
- **Fail-Safe Fallback:** If Supabase credentials are missing (e.g. offline dev or isolated test environments), the service falls back to a development mock storage URL, preventing unhandled HTTP 500 exceptions.

---

## 6. Git Safety Audit

Inspection of Git status reveals:
- **Branch:** `main`
- **Current HEAD:** `58493f74b1724b80433ebe59b0ba08cc5b6cd4b1` (`58493f7`)
- **Staging Status:** `0` files staged (`git diff --cached` has 0 changes).
- **Remote Synchronization:** Local `main` is synchronized with `origin/main`.
- **Zero Secrets Rule:** All API keys, tokens, and database passwords remain secured in environment variables; none have been written to disk or logs.

