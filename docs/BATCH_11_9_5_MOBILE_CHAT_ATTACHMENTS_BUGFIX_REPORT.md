# Batch 11.9.5 Report: Mobile Chat Media Attachments Bugfix & Android APK Parity

**Date:** November 20, 2026  
**Status:** Completed & Verified  
**Workspaces Affected:** `apps/mobile`  
**Git Branch:** `main`  

---

## 1. Executive Summary

Following user feedback on the Android standalone APK (`com.apnasamaj.app`), attachments (photos, videos, and documents) were failing to attach and upload in both **Direct Chat** (`/chat/:id`) and **Group Chat** (`/group/:slug/chat`). A thorough end-to-end investigation revealed 5 interrelated root causes across Android permissions, Modal lifecycle timing, Hermes `FormData` duck-typing, and chat screen upload state handling.

All issues were resolved, verified with unit & integration tests (15/15 passing in mobile chat media attachments suite), passed monorepo typecheck across all 10 workspaces with zero errors, and configured for an updated EAS Cloud APK build.

---

## 2. Root Cause Analysis & Resolutions

### A. Missing Android Media Permissions & Config Plugin (`apps/mobile/app.json`)
* **Root Cause:** `android.permissions` in `app.json` was explicitly configured with only `RECORD_AUDIO` and `POST_NOTIFICATIONS`. In Expo EAS builds, explicitly listing `android.permissions` overrides default merged permissions, stripping out `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, and `READ_EXTERNAL_STORAGE` from `AndroidManifest.xml`. Furthermore, the `expo-image-picker` config plugin was not listed in `plugins`. Consequently, `ImagePicker.requestMediaLibraryPermissionsAsync()` returned `granted: false` on Android devices, immediately terminating the picker routine before opening the gallery.
* **Resolution:** 
  - Added `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, and `READ_MEDIA_AUDIO` to `android.permissions`.
  - Added `expo-image-picker` to `plugins` with localized permission descriptions.
  - Added `NSPhotoLibraryUsageDescription` and `NSCameraUsageDescription` to iOS `infoPlist`.

### B. Modal Dismissal vs Native Picker Activity Race Condition (`ChatAttachmentButton.tsx`)
* **Root Cause:** React Native's `<Modal>` is backed by a native `android.app.Dialog`. Calling `setIsModalOpen(false)` immediately before launching `ImagePicker.launchImageLibraryAsync()` or `DocumentPicker.getDocumentAsync()` triggered Dialog window detachment events that canceled the newly launched picker Activity, resulting in `{ canceled: true }` and no attachment being selected.
* **Resolution:** Introduced a non-blocking `closeAndRun` helper that closes the modal, allows the Android window transition to cleanly finish (250ms), and then triggers the picker.
* **Permissions on Android 13+:** Handled `ImagePicker.getMediaLibraryPermissionsAsync()` non-blockingly so Android 13+ system photo pickers (which do not require runtime permissions) open reliably without getting aborted.
* **File & MIME Normalization:** Added robust fallbacks for filenames (deriving from URI parts or timestamp) and MIME types (deriving from file extension).

### C. Hermes FormData Detection in API Client (`apps/mobile/src/api/client.ts`)
* **Root Cause:** `client.ts` checked `options.body instanceof FormData`. In React Native's Hermes engine, `new FormData()` is an instance of React Native's polyfill (`libraries/Network/FormData.js`), which can evaluate `instanceof FormData` to `false` across bundled module boundaries.
* **Consequence:** 
  1. `delete headers['Content-Type']` was skipped, leaving `Content-Type: application/json`.
  2. `body = JSON.stringify(options.body)` ran, converting the `FormData` instance to `"{}"`.
  3. The backend received an empty JSON body; multer never parsed any file, returning HTTP 400 `No file was provided for upload`.
* **Resolution:** Replaced strict `instanceof` with robust duck-typing:
  ```typescript
  const isFormData =
    Boolean(options.body) &&
    (
      (typeof FormData !== 'undefined' && options.body instanceof FormData) ||
      typeof (options.body as any)?.append === 'function' ||
      Array.isArray((options.body as any)?._parts) ||
      (options.body as any)?.[Symbol.toStringTag] === 'FormData'
    );
  ```

### D. File Descriptor Normalization (`apps/mobile/src/api/chat.api.ts`)
* **Root Cause:** When appending native file descriptors (`{ uri, name, type }`) to `FormData`, empty or missing `name` or `type` parameters could cause Android networking to throw `java.lang.IllegalArgumentException: type == null`.
* **Resolution:** Added safe string trimming and fallbacks:
  ```typescript
  const resolvedName = file.name && file.name.trim() ? file.name.trim() : `file_${Date.now()}`;
  const resolvedType = file.type && file.type.trim() ? file.type.trim() : 'application/octet-stream';
  ```

### E. Attachment State Clearing & Error Reporting (`chat/[id].tsx` & `group/[slug]/chat.tsx`)
* **Root Cause:** Both direct chat and group chat screens called `setSelectedAttachment(null)` and `setInputText('')` *before* the upload network request finished. If the upload failed, the user lost their selected file and typed text, while receiving a generic error alert. Additionally, if `group?.id` was still loading, the upload was skipped silently.
* **Resolution:** 
  - Validated `conversationId` and `group.id` readiness before uploading; if missing, informed user gracefully.
  - Reset `selectedAttachment` and `inputText` *only upon successful send*.
  - Surfaced the exact error message from the backend in the alert dialog.

---

## 3. Verification & Test Results

1. **Mobile Test Suite:**
   - Command: `npm test -w @apnasamaj/mobile`
   - Result: All test suites passed 100%.
   - Chat Media Attachments Suite: 15/15 passed (including new fallback test).
2. **Monorepo Typecheck:**
   - Command: `npm run typecheck`
   - Result: 0 errors across all 10 workspaces (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/mobile`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`, root).
3. **Security & Tenant Isolation:**
   - All chat attachment requests strictly route through `apiClient` injecting `x-community-slug` header and Bearer tokens.
   - Physical tenant isolation enforced by backend `req.db` and `assertDb(req.db)`.
   - Zero secrets exposed in repository or logs.

---

## 4. Modified Files

- `apps/mobile/app.json`: Added Android media permissions and `expo-image-picker` plugin configuration.
- `apps/mobile/src/api/client.ts`: Enhanced `isFormData` duck-typing to prevent React Native FormData stringification.
- `apps/mobile/src/api/chat.api.ts`: Added filename and MIME type fallback resolution.
- `apps/mobile/src/components/chat/ChatAttachmentButton.tsx`: Added `closeAndRun` timing guard, Android 13+ permission tolerance, and filename/MIME normalization.
- `apps/mobile/app/(app)/chat/[id].tsx`: Guarded attachment state clearing and improved error feedback.
- `apps/mobile/app/(app)/group/[slug]/chat.tsx`: Guarded attachment state clearing, validated `group.id`, and improved error feedback.
- `apps/mobile/src/tests/chat-media-attachments-flow.test.ts`: Added unit test for native fallback descriptors.
