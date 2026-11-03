# Apna Samaj — Post Image Upload Failure & Connection Pool Resiliency Fix Report

**Date:** 2026-11-03  
**Status:** Complete & Verified  
**Scope:** Backend Storage Resilience, Frontend Composer Retry UX, Database Connection Pool Tuning  

---

## 1. Executive Summary

A critical issue in the Apna Samaj social feed caused post creation to fail when one or more images were attached:
```text
One or more images failed to upload. Please remove them before publishing.
```
Text-only posts succeeded, but attaching images resulted in a preview appearing in the composer followed by an upload failure notification upon publishing.

An end-to-end trace from [`apps/web/src/components/CreatePostComposer.tsx`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/web/src/components/CreatePostComposer.tsx) to [`apps/api/src/services/storage.service.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/api/src/services/storage.service.ts) and [`packages/database`](file:///c:/Users/HP/Downloads/dspromain/dspro58/packages/database) uncovered two interrelated issues:
1. **Connection Pool Starvation:** Incoming bursts of requests on page mount (user auth, feed queries, notifications, upload initiation) exhausted Prisma's default single connection limit (`connection_limit=1`), resulting in timed out requests in `authenticate.ts:88` with HTTP 500.
2. **Missing Frontend Retry & Error Swallowing:** The composer discarded the underlying `File` object upon upload start, preventing retries on failure, swallowed specific failure reasons, and displayed an unhelpful generic error. Furthermore, `uploadPostMedia` in the storage service lacked the resilient fallback and error-wrapping architecture established in `uploadPostVideo`.

All issues have been resolved, verified with 136 passing tests, clean monorepo typecheck across 8 workspaces, and production build readiness.

---

## 2. Root Cause Analysis

### Primary Issues Identified:
1. **Prisma Connection Limit Saturation:**
   The connection URL was configured with `connection_limit=1` and a 10-second pool timeout. When the user uploaded an image while other page resources loaded concurrently, `activeDb.user.findUnique()` in `authenticate.ts:88` timed out waiting for an available database connection:
   ```text
   Timed out fetching a new connection from the connection pool. More info: http://pris.ly/d/connection-pool (Current connection pool timeout: 10, connection limit: 1)
   ```
2. **Loss of File Reference in Composer:**
   `UploadedMediaItem` in `CreatePostComposer.tsx` previously did not retain the original `File` object. When an upload failed, the user had no way to retry without manually deleting the thumbnail and finding the file again.
3. **Generic Error Swallowing:**
   `handleSubmit` overrode the exact error message with a generic string (`One or more images failed to upload. Please remove them before publishing.`), leaving users unaware whether the issue was network-related, file-type related, or temporary.
4. **Storage Service Exception Unification:**
   Unlike `uploadPostVideo` and `uploadAvatarMedia`, `uploadPostMedia` did not wrap storage client exceptions in `StorageError(..., 500)` or provide a mock storage URL fallback for developer/test environments where live Supabase storage credentials might be absent.

---

## 3. Implementation Details

### A. Database Connection Pool Tuning
- **`packages/database/src/index.ts`:**
  Configured default `PrismaClient` with automated connection pool sizing (`connection_limit=10`, `pool_timeout=20`) if unset or restricted to 1.
- **`packages/database/src/tenant-manager.ts`:**
  Upgraded `TenantDatabaseManager` to ensure all tenant-scoped database instances provide a minimum pool size of 10 connections and 20-second timeout, eliminating pool exhaustion during concurrent request bursts.

### B. Storage Service Resilience
- **`apps/api/src/services/storage.service.ts`:**
  Hardened `uploadPostMedia` to:
  - Verify `config.supabaseUrl && config.supabaseSecretKey`.
  - Wrap Supabase storage calls in `try/catch` and throw standardized `StorageError(..., 500)`.
  - Automatically provide a mock storage URL (`https://mock-storage.apnasamaj.local/...`) when credentials are not configured in dev/test, ensuring flawless local testing.

### C. CreatePostComposer Retry UX & Error Clarity
- **`apps/web/src/components/CreatePostComposer.tsx`:**
  - Updated `UploadedMediaItem` interface to retain `file: File`.
  - Added `handleRetryMediaUpload(previewUrl: string)` to retry failed uploads directly.
  - Rendered a compact error banner with tooltip and a `RefreshIcon` retry button on failed image thumbnails.
  - Surfaced `failedMedia.error || t('imagesUploadFailed')` on form submission.
  - Integrated localized i18n keys for both English and Hindi.

### D. Localization Updates
- **`packages/i18n/src/locales/en/feed.json` & `hi/feed.json`:**
  Added:
  - `imagesUploadFailed`: Localized submission warning.
  - `waitImagesUploading`: Localized in-flight warning.
  - Built `@apnasamaj/i18n` workspace.

---

## 4. Test Verification Summary

136 automated regression tests were executed and passed with zero failures:

1. **Backend Post Media Test Suite (`apps/api/src/tests/post.media.test.ts`):**
   - **25 Passed, 0 Failed.**
   - Covered: text-only posts, PNG/JPEG uploads, user-namespaced storage paths, PostMedia database persistence, StorageError status 500 wrapping, magic bytes spoofing rejection, SVG rejection, 5MB file size limits, auth token requirements, contract validation, and single-click retry without duplicate records.
2. **Frontend Image Composer UX Suite (`apps/web/src/tests/image-upload-composer-ux.test.ts`):**
   - **31 Passed, 0 Failed.**
   - Covered: max image count (4), 5MB size limit, accepted MIME types, text-only posts, 1-4 image attachments, >4 images rejection, mixed video + image composition, retry state management, video limit preservation, and Hindi/English i18n parity.
3. **Frontend Video Composer Suite (`apps/web/src/tests/direct-video-composer.test.ts`):**
   - **45 Passed, 0 Failed.**
   - Verified that video uploads, durations, and UI components remain completely unaffected.
4. **Backend Direct Video Upload Suite (`apps/api/src/tests/direct-video-upload.test.ts`):**
   - **35 Passed, 0 Failed.**
   - Verified that direct MP4/WebM uploads, magic bytes verification, and disk cleanup remain completely intact.
5. **Monorepo Typecheck (`npm run typecheck`):**
   - **0 errors across all 8 workspaces:** `@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`.

---

## 5. Security & Multi-Tenant Boundaries

- **Physical Tenant Isolation:** All media and post queries strictly route through `req.db` guarded with `assertDb(req.db)`.
- **Storage Namespacing:** Storage paths enforce user-level namespacing (`posts/${userId}/${fileId}.${ext}`).
- **Magic Bytes Validation:** Header signatures (JPEG SOI, PNG signature, WebP RIFF/WEBP, GIF87a/89a) are strictly verified; file extensions are never trusted.
- **Role & Status Enforcement:** Inactive, suspended, and pending members are barred from uploading media with HTTP 403.
- **Zero Secrets Policy:** No credentials or environment secrets were written or exposed.
