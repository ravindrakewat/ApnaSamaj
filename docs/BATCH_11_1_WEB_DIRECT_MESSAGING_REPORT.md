# Batch 11.1 Report: Web Direct Messaging & Unified Chat Portal

**Date:** 2026-11-18  
**Status:** ✅ Completed and Verified  
**Workspace:** `apps/web`  

---

## 1. Executive Summary

Batch 11.1 brings the Apna Samaj Website to full feature parity with the Mobile App's Direct Messaging & Chat system. Prior to this batch, the web application only possessed legacy group chat viewing capabilities. Users could not direct-message members, record voice notes, attach multiple media types with progress, react with emojis, reply in-line, delete messages with dual scopes, preview YouTube links, search conversations, or browse the media gallery.

All of these capabilities have now been implemented and verified in `apps/web` without requiring any changes to backend APIs, database schemas, or mobile code.

---

## 2. Implemented Features & Components

### 2.1 Media Attachment URL Resolution (`apps/web/src/utils/attachment.ts`)
- **Supabase Storage Direct CDN:** Preserves valid signed URLs.
- **Mock-Storage Rewriting:** Rewrites dev/staging mock-storage URLs to the backend raw attachment proxy (`/api/v1/chat/attachments/raw/*`).
- **Relative Path Resolution:** Normalizes `/uploads/chat-attachments/*` paths.
- **YouTube Parser:** Robust regex and URL-parsing helper extracting video ID and official high-resolution thumbnail.

### 2.2 Direct Chat Service API Client (`apps/web/src/services/chat.service.ts`)
- `fetchDirectInbox`: Retrieves paginated 1-on-1 conversations list with unread counts and last message previews.
- `createOrGetDirectConversation`: Initiates or retrieves an existing conversation with a target member.
- `fetchDirectMessages`: Paginated message retrieval with cursor support.
- `sendDirectMessageApi`: Dispatches text, replies, and attachments.
- `uploadDirectAttachmentApi`: Multipart media upload supporting Images, Videos, Audio Voice Notes, and Documents.
- `toggleDirectReactionApi` / `removeDirectReactionApi`: Invariant-checked 6 standard reactions (`👍`, `❤️`, `😂`, `😮`, `😢`, `🙏`).
- `deleteDirectMessageApi`: Supports `ME` (Delete for Me) and `EVERYONE` (Delete for Everyone).
- `markDirectConversationReadApi`: Clears unread counter for the active conversation.
- `searchDirectMessagesApi`: Keyword search across conversation history.
- `getDirectMediaGalleryApi`: Filterable media browser (images, videos, documents, audio).

### 2.3 Unified Chat Portal (`apps/web/src/pages/ChatPage.tsx`)
- **Responsive Layout:** Desktop split-pane view (380px inbox left + active conversation stream right), tablet flexible layout, and full-screen mobile view with header back navigation.
- **Inbox Tabs:** Direct Messages tab and Groups tab with unread count badges and search filtering.
- **Real-Time WebSocket Integration:** Socket.IO hooks for `direct:join`, `direct:leave`, `direct:new_message`, `direct:user_typing`, `direct:reaction_updated`, and `direct:message_deleted`.
- **Media Lightbox & Video Player:** Image dialog with full zoom/preview and responsive HTML5 video playback.
- **Voice Note Recording:** Built-in `MediaRecorder` support for audio voice notes with live elapsed timer and direct upload as WebM/audio.
- **YouTube Link Previews:** Automatically extracts YouTube URLs from message bodies and embeds an interactive card with high-quality thumbnail and channel metadata.
- **Reactions Pill Bar:** Quick reaction popup displaying standard 6 emojis, active user highlight, and aggregated reaction counters.
- **Message Context Menu:** Options to Reply, Copy Text, Delete for Me, and Delete for Everyone (with permission check).
- **Search & Media Gallery Drawers:** Slide-out right drawers for keyword search and gallery browsing.

### 2.4 Profile Integration & Navigation
- **Member Profile CTA:** Added `💬 व्यक्तिगत संदेश भेजें / Send Message` button in `apps/web/src/pages/MemberProfilePage.tsx` that routes straight into `/chat/:conversationId`.
- **Navbar Navigation:** Added direct Chat portal link (`/chat`) in `apps/web/src/components/Navbar.tsx` alongside existing community navigation.
- **Route Registration:** Registered `/chat` and `/chat/:conversationId` with lazy loading in `apps/web/src/App.tsx`.

---

## 3. Verification & Test Results

1. **Test Suite:** `apps/web/src/tests/web-chat-experience.test.ts`
   - Attachment URL normalization: 5/5 passed.
   - Standard 6 emoji reactions: 7/7 passed.
   - YouTube URL detection inside text and standalone: 3/3 passed.
   - Deletion scope contracts (`ME` vs `EVERYONE`): 2/2 passed.
   - Result: 17/17 assertions passed cleanly.

2. **Typecheck:**
   - Command: `npm run typecheck --workspace=@apnasamaj/web`
   - Result: Exited with code 0. Zero TypeScript errors.

3. **Production Build:**
   - Command: `npm run build --workspace=@apnasamaj/web`
   - Result: Successfully bundled in 13.45s with code-split `ChatPage-UW0FIqSD.js` (29.93 kB).
