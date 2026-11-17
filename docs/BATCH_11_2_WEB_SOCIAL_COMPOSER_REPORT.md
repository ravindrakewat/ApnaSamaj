# Batch 11.2 Report: Web Social Composer & Feed Parity

**Date:** 2026-11-18  
**Status:** ✅ Completed and Verified  
**Workspace:** `apps/web`, `packages/validation`  

---

## 1. Executive Summary

Batch 11.2 aligns the Apna Samaj Web social experience directly with the Mobile App source of truth. Previously, the web composer was capped at 4 photos, had no target group selector when posting from the main feed, lacked visual ordering badges, and the feed lacked navigation chips for Employment, Government Schemes, and Matrimonial.

All of these features have now been implemented, tested, and validated.

---

## 2. Implemented Features & Changes

### 2.1 Multi-Photo Upload Grid (Up to 5 Images)
- **Validation Schema Update (`packages/validation/src/post.ts`):** Raised attachment limit in `createPostSchema` and `updatePostSchema` from 4 to 5 without altering database schemas or breaking existing constraints.
- **Web Composer (`apps/web/src/components/CreatePostComposer.tsx`):**
  - Updated `MAX_IMAGES` and `MAX_TOTAL_MEDIA` constants to 5.
  - Implemented responsive grid layout for photo previews with thumbnail display.
  - Added visual sequence badges (`#1`, `#2`, ..., `#5`) on each preview thumbnail.
  - Individual remove buttons (`CloseIcon`) with tooltips.
  - Uploading overlay state with circular spinner.
  - Inline error banners with one-click retry (`RefreshIcon`).

### 2.2 Target Group Selector
- When composing from the global community feed (`!groupId`), the composer fetches available groups via `fetchGroups()`.
- Users can select either `🌐 सार्वजनिक फ़ीड (सभी के लिए) / Public Feed` or target a specific community group.
- The selected group ID is validated and passed to `createPostApi()`.

### 2.3 YouTube Video URL Input and Preview
- Supported in both modal input and inline detection.
- Previews the YouTube video thumbnail, video ID, and clean embed representation.
- Provides immediate remove and replacement controls.

### 2.4 Feed Category Filter Chips (`apps/web/src/pages/FeedPage.tsx`)
- Extended the filter chip bar to match the Mobile App source of truth:
  - `📰 सभी / All`
  - `💬 सामान्य / General`
  - `📢 सूचनाएं / Notices`
  - `📅 आयोजन / Events`
  - `💼 रोजगार / Jobs` (navigates directly to `/employment`)
  - `🏛️ सरकारी योजनाएं / Schemes` (navigates directly to `/government-schemes`)
  - `💍 वैवाहिक / Matrimonial` (navigates directly to `/matrimonial`)

---

## 3. Verification & Test Results

1. **Test Suite:** `apps/web/src/tests/web-social-composer.test.ts`
   - Multi-photo upload validation (up to 5 images): ✅ Passed
   - Rejection of payloads exceeding 5 attachments: ✅ Passed
   - Group-targeted posting schema validation: ✅ Passed
   - YouTube video embed validation: ✅ Passed
   - Result: 5/5 test assertions passed cleanly.

2. **Typecheck:**
   - Command: `npm run typecheck --workspace=@apnasamaj/web`
   - Result: Exited with code 0. Zero TypeScript errors.

3. **Production Build:**
   - Command: `npm run build --workspace=@apnasamaj/web`
   - Result: Exited with code 0. Built successfully in 13.09s.
