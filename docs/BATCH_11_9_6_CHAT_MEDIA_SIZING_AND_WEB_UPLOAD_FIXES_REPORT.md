# BATCH 11.9.6: Chat Media Bubble Sizing & Web Media Upload / Display Fixes Report

**Date:** 2026-11-21  
**Status:** COMPLETE & VERIFIED  
**Workspaces Affected:** `apps/mobile`, `apps/web`, `apps/api`, `packages/shared-types`, `packages/validation`

---

## 1. Executive Summary

This batch addresses two critical issues reported during mobile and web end-to-end chat validation:
1. **Mobile Chat Image/Media Sizing:** Uploaded images and media thumbnails in direct and group chats appeared tiny (~40x30px) when message captions were short (e.g., "hii"). In React Native Flexbox, message bubbles shrink-wrapped to child text length when no minimum dimensions were enforced.
2. **Web Chat Media Upload & Visibility:** Media files (images, videos, audio, documents) failed to upload or display on `apps/web` (Direct Chat & Group Chat) due to:
   - Backend fallback generating `http://localhost:${apiPort}` URLs (e.g., `localhost:10000` on Render) inaccessible by browser clients over HTTPS.
   - Frontend attachment URL resolver failing to map relative storage paths (e.g., `direct/...`, `groups/...`) to raw streaming endpoints.
   - MUI button event propagation blocking `<label htmlFor="file-input">` triggers across desktop and mobile web browsers.
   - Zod validation strictly rejecting attachments with nullable/float duration metadata.

All fixes were implemented cleanly across mobile, web, backend, and shared validation/types packages, verified via test suites and full monorepo typechecks.

---

## 2. Detailed Technical Fixes

### A. Mobile App Image & Media Bubble Sizing (`apps/mobile`)
- **`ChatImageMessage.tsx`**:
  - Replaced shrinkable `aspectRatio: 4/3` and `maxWidth: 240` with fixed WhatsApp-style dimensions: `width: 260, minWidth: 220, maxWidth: '100%', height: 195, borderRadius: 12`.
- **`ChatVideoMessage.tsx` & `ChatDocumentMessage.tsx`**:
  - Configured cards to `width: 260, minWidth: 220, maxWidth: '100%'` with video placeholder height `150`.
- **`app/(app)/chat/[id].tsx` & `app/(app)/group/[slug]/chat.tsx`**:
  - Added `bubbleWithAttachment` style (`minWidth: 270, maxWidth: '88%'`) applied whenever a message contains attachments, preventing flex shrink-wrapping.
- **`attachment.ts` & `ChatAudioMessage.tsx`**:
  - Enhanced `resolveAttachmentDisplayUrl` to automatically rewrite `localhost`/`127.0.0.1` origins to active API server URL.
  - Updated audio message props to accept nullable durations.

### B. Backend API Storage & URL Normalization (`apps/api`)
- **`storage.service.ts`**:
  - Introduced `getPublicApiBaseUrl()` helper: inspects `PUBLIC_API_URL`, `RENDER_EXTERNAL_URL`, falls back to production `https://api.samaz.in` or local dev port.
  - Replaced hardcoded `http://localhost:${apiPort}` in `resolveChatAttachmentUrl()` and `createTemporarySignedChatAttachmentUrl()` with `getPublicApiBaseUrl()`.

### C. Validation & Shared Types (`packages/validation`, `packages/shared-types`)
- **`packages/validation/src/chat.ts`**:
  - Updated `duration` in `chatAttachmentInputSchema` to `z.number().nonnegative().max(7200).optional().nullable()`.
- **`packages/shared-types/src/chat.ts`**:
  - Updated `duration?: number | null;` in both `ChatAttachmentInput` and `ChatAttachmentItem` matching database schema `duration Int?`.

### D. Web Chat Attachment Upload & Display (`apps/web`)
- **`apps/web/src/utils/attachment.ts`**:
  - Added regex `/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/` to rewrite any local API origin to production `API_BASE_URL`.
  - Added dedicated routing for `cleanUrl.startsWith('direct/') || cleanUrl.startsWith('groups/')` to `${API_BASE_URL}/api/v1/chat/attachments/raw/${cleanUrl}`.
  - Handled `/uploads/chat-attachments/` and `/api/v1/chat/attachments/raw/` paths.
- **`apps/web/src/pages/ChatPage.tsx` & `apps/web/src/components/chat/GroupChatTab.tsx`**:
  - Replaced fragile `<label htmlFor="...">` with direct `fileInputRef.current?.click()` attached to the attachment `<IconButton>`.
  - Added bubble `minWidth: { xs: 260, sm: 300 }` when attachments are present.
  - Configured images and videos to `width: '100%', minWidth: 240, maxWidth: 360, maxHeight: 320`.
  - Cleaned up attachment input mapping when calling `sendDirectMessageApi`.

---

## 3. Verification & Test Results

1. **Full Monorepo Typecheck:**
   - Command: `npm run typecheck`
   - Results: All 8 packages (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/mobile`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/validation`) passed with code `0`.
2. **Backend Chat Media Attachment Test Suite:**
   - Command: `npx tsx apps/api/src/tests/chat-media-attachments.test.ts`
   - Results: **34 passed, 0 failed**.
3. **Backend Voice Notes & Audio Messaging Test Suite:**
   - Command: `npx tsx apps/api/src/tests/voice-notes-backend.test.ts`
   - Results: **12 passed, 0 failed**.
4. **Web Production Build:**
   - Command: `npm run build -w @apnasamaj/web`
   - Results: Built in 17.44s with code `0`.
5. **Admin Production Build:**
   - Command: `npm run build -w @apnasamaj/admin`
   - Results: Built in 13.37s with code `0`.

---

## 4. Staging Allowlist

```text
apps/api/src/services/storage.service.ts
apps/mobile/app/(app)/chat/[id].tsx
apps/mobile/app/(app)/group/[slug]/chat.tsx
apps/mobile/src/components/chat/ChatAudioMessage.tsx
apps/mobile/src/components/chat/ChatDocumentMessage.tsx
apps/mobile/src/components/chat/ChatImageMessage.tsx
apps/mobile/src/components/chat/ChatVideoMessage.tsx
apps/mobile/src/utils/attachment.ts
apps/web/src/components/chat/GroupChatTab.tsx
apps/web/src/pages/ChatPage.tsx
apps/web/src/utils/attachment.ts
packages/shared-types/src/chat.ts
packages/validation/src/chat.ts
docs/BATCH_11_9_6_CHAT_MEDIA_SIZING_AND_WEB_UPLOAD_FIXES_REPORT.md
```
