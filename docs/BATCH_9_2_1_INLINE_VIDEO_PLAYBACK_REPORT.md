# Batch 9.2.1 — Facebook-Style Inline Video Playback Fix & Low-RAM Optimization Report

**Date:** November 10, 2026  
**Status:** COMPLETED & VERIFIED  
**Target Platform:** React Native + Expo SDK 52 (Android / iOS)  
**Monorepo Packages Modified:** `@apnasamaj/mobile`  
**Test Suite Status:** 22/22 Batch 9.2.1 Tests Passed | 41/41 Batch 9.2 Tests Passed | Total Mobile Tests Passing  

---

## 1. Executive Summary & Objective

In Batch 9.2, unified in-app video playback was introduced for both YouTube and uploaded videos using `UnifiedVideoModal.tsx`. However, playing feed videos opened a modal popup instead of playing inline directly inside the Feed post card. Additionally, member-uploaded videos in posts failed to play due to a critical URL rewriting bug in `resolveAttachmentDisplayUrl`.

### Key Objectives Achieved:
1. **Facebook-Style Inline Feed Playback:**
   - Completely removed modal-based playback (`UnifiedVideoModal` / `VideoModal`) from the Social Feed (`apps/mobile/app/(app)/index.tsx`).
   - Tapping a video thumbnail in `PostCard.tsx` replaces the thumbnail with the in-place player directly inside the card without opening any popup, dialog, or external browser.
   - Both YouTube videos (official embed player) and member-uploaded videos (native `expo-av` `<Video>`) play inline seamlessly.
   - The post author row, title, post content, and the like/comment/share action bar remain completely visible and interactive while the video plays.
2. **Root Cause Resolution for Uploaded Video Playback Failure:**
   - Diagnosed and fixed the defect in `apps/mobile/src/utils/attachment.ts`:
     - Previously, Rule 3 intercepted all URLs containing `/storage/v1/object/public/` and rewrote them to `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${cleanPath}`.
     - Because post videos are uploaded to the public Supabase bucket `community-media`, while `/chat/attachments/raw/*` only queries `uploads/chat-attachments/` and the private `chat-attachments` bucket, the backend returned **404 Not Found**, causing video players to fail with `AVPlayerItem error / Video playback failed`.
     - Fixed `resolveAttachmentDisplayUrl`: public buckets (`community-media`) now preserve their valid direct HTTPS URLs without erroneous rerouting. Only private chat-attachments or mock-storage attachments are routed to the raw proxy.
3. **Low-RAM Android Video Playback Management:**
   - **Single Active Player Invariant:** Exactly ONE feed video can play at any given time across the entire Feed. Starting a second video immediately unmounts and stops the previous video.
   - **Immediate Hardware Decoder Release:** On unmount of `NativeVideoPlayer`, `videoRef.current.unloadAsync()` immediately releases the native media codec handles, preventing Out-Of-Memory (OOM) crashes on low-RAM Android devices.
   - **Viewability Auto-Pause on Scroll:** Integrated `FlatList` `onViewableItemsChanged` (with 40% visibility threshold). When an active playing video scrolls out of the visible screen area, playback is stopped and its hardware decoders are freed.
   - **Zero Layout Shifts & Scroll Preservation:** Both preview thumbnails and inline players share identical dimensions (`height: 200, borderRadius: 8, marginBottom: 10`), ensuring zero layout jumping or scroll disruption when playing, pausing, or swapping videos.
4. **Post Details & Chat Message Compatibility:**
   - Post Details screen (`apps/mobile/app/(app)/post/[id].tsx`) updated to support inline playback directly on the post card.
   - Chat video playback (`apps/mobile/src/components/chat/ChatVideoMessage.tsx`) remains protected and utilizes `UnifiedVideoModal` for small compact chat bubbles as intended.
   - Supabase private storage security invariants remain completely preserved.

---

## 2. Root Cause Analysis & Fix: Uploaded Video Playback Failure

### Identified Defect in `apps/mobile/src/utils/attachment.ts`:
```typescript
// PREVIOUS DEFECTIVE CODE:
if (url.includes('/storage/v1/object/public/')) {
  const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
  if (match && match[1]) {
    const cleanPath = match[1].split('?')[0];
    return `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${cleanPath}`;
  }
}
```

### Why Uploaded Post Videos Failed:
1. When a video was uploaded to a post, `uploadPostVideo` in `apps/api/src/services/storage.service.ts` uploaded the file to `community-media/posts/{userId}/{uuid}.mp4` and returned the public URL:
   `https://<ref>.supabase.co/storage/v1/object/public/community-media/posts/{userId}/{uuid}.mp4`
2. `PostCard.tsx` called `resolveVideoPlaybackUrl(video.url)` which passed the URL to `resolveAttachmentDisplayUrl()`.
3. Rule 3 matched `/storage/v1/object/public/` and rewrote the URL to:
   `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/posts/{userId}/{uuid}.mp4`
4. The backend controller `serveLocalChatAttachmentHandler` (`apps/api/src/modules/chat/chat.controller.ts`) strictly checks:
   - `uploads/chat-attachments/` on local disk.
   - The private `CHAT_ATTACHMENTS_BUCKET` (`chat-attachments`) in Supabase Storage.
5. Because the post video was located in the public bucket `community-media`, the controller could not locate it and safely returned **HTTP 404 Not Found**.
6. The native video player received an HTML 404 response instead of an MP4 stream, throwing a playback error.

### Corrected Implementation:
```typescript
// CORRECTED SAFE CODE (apps/mobile/src/utils/attachment.ts):
// 3. If an unauthenticated public Supabase URL was generated specifically for the PRIVATE chat-attachments bucket
// (Note: public buckets like community-media must NOT be rewritten to /chat/attachments/raw/ as that endpoint
// strictly serves private chat attachments from uploads/chat-attachments and returns 404 for post media)
if (url.includes('/storage/v1/object/public/chat-attachments/')) {
  const rawPath = url.split('/storage/v1/object/public/chat-attachments/')[1]?.split('?')[0];
  if (rawPath) {
    return `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${rawPath}`;
  }
}
```
Public Supabase URLs for `community-media` now stream directly from Supabase CDN or public storage, while private chat attachments remain securely routed through the backend proxy.

---

## 3. Architecture & Implementation Details

### A. Facebook-Style Inline Video in `PostCard.tsx`
- **Props Added:**
  - `isPlayingInline?: boolean;`
  - `onPlayInline?: (postId: string) => void;`
  - `onPauseInline?: () => void;`
- **Conditional Rendering:**
  - If `isPlayingInline` is `false`: Renders video thumbnail preview with 🔴 YouTube or 🎥 Video badge, and centered play button overlay. Tapping calls `onPlayInline(post.id)`.
  - If `isPlayingInline` is `true`:
    - If YouTube: Renders `YouTubeVideoPlayer` with `embedUrl`, `playsinline=1`, and modest branding.
    - If Uploaded Video: Renders `NativeVideoPlayer` with `videoUrl`, `autoPlay={true}`, and full seek/mute controls.
- **Fixed Layout & Aspect Ratio:**
  - Both `videoContainer` and `inlinePlayerContainer` have `height: 200, borderRadius: 8, marginBottom: 10`.
  - Zero layout shift when swapping thumbnail with player.

### B. Feed State & Low-RAM Management (`apps/mobile/app/(app)/index.tsx`)
- **Single Active Player State:**
  ```typescript
  const [activePlayingPostId, setActivePlayingPostId] = useState<string | null>(null);
  ```
- **Viewability Auto-Pause Callback:**
  ```typescript
  const activePlayingPostIdRef = useRef<string | null>(null);
  useEffect(() => {
    activePlayingPostIdRef.current = activePlayingPostId;
  }, [activePlayingPostId]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: PostItem }> }) => {
    if (activePlayingPostIdRef.current) {
      const isStillVisible = viewableItems.some((v) => v.item?.id === activePlayingPostIdRef.current);
      if (!isStillVisible) {
        setActivePlayingPostId(null);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
  }).current;
  ```
- **Decoder Release on Unmount:**
  `NativeVideoPlayer` triggers `videoRef.current.unloadAsync()` in its `useEffect` cleanup handler. Whenever `activePlayingPostId` changes or the post scrolls out of view, the hardware decoder handle is freed immediately.

### C. Post Details Screen (`apps/mobile/app/(app)/post/[id].tsx`)
- Added `isPlayingInline` state and connected to `PostCard`.
- Removed `VideoModal` modal dependency. Videos play inline inside the post details view.

### D. Chat Messages (`apps/mobile/src/components/chat/ChatVideoMessage.tsx`)
- Preserved `UnifiedVideoModal` playback for chat messages. Compact chat bubbles (240px wide) cleanly open the unified player without any degradation.

---

## 4. Automated Verification Results

### Suite: `apps/mobile/src/tests/inline-video-playback.test.ts`
Registered in `apps/mobile/src/tests/test-runner.ts` and executed via `npm run test -w @apnasamaj/mobile`:

| Category | Test Assertion | Result |
|---|---|---|
| **Storage Resolution** | Preserves public community-media Supabase video URL without rewriting to /chat/attachments/raw/ | ✅ PASS |
| **Storage Resolution** | Public community-media video is NOT redirected to private chat endpoint | ✅ PASS |
| **Storage Resolution** | Preserves valid Supabase signed storage URL | ✅ PASS |
| **Storage Resolution** | Properly rewrites private chat-attachments public URL to secure API streaming endpoint | ✅ PASS |
| **Storage Resolution** | Rewrites mock storage chat-attachments URL to backend raw proxy | ✅ PASS |
| **Storage Resolution** | Rewrites localhost:4000 to active API host on physical/emulator devices | ✅ PASS |
| **Source Routing** | Identifies YouTube video for inline playback | ✅ PASS |
| **Source Routing** | Extracts YouTube ID for inline WebView embed | ✅ PASS |
| **Source Routing** | Uses privacy-enhanced embed domain for inline YouTube playback | ✅ PASS |
| **Source Routing** | Sets playsinline=1 for inline Facebook-style playback without taking over full screen | ✅ PASS |
| **Source Routing** | Identifies uploaded MP4 video for native inline player | ✅ PASS |
| **Source Routing** | Preserves direct streamable MP4 URL for native player | ✅ PASS |
| **Source Routing** | Preserves thumbnail for initial preview | ✅ PASS |
| **Low-RAM Management** | Feed starts with no active inline video playing | ✅ PASS |
| **Low-RAM Management** | Post 1 is now playing inline | ✅ PASS |
| **Low-RAM Management** | Starting Post 2 immediately stops and unloads Post 1 | ✅ PASS |
| **Low-RAM Management** | Invariant satisfied: strictly one video plays at a time | ✅ PASS |
| **Low-RAM Management** | Pausing sets activePlayingPostId to null | ✅ PASS |
| **Viewability Tracking** | Video continues playing while post is within viewable items threshold | ✅ PASS |
| **Viewability Tracking** | Video playback is automatically stopped and unloaded when scrolled out of viewport | ✅ PASS |
| **Feed Architecture** | PostCard renders thumbnail preview by default when not active | ✅ PASS |
| **Feed Architecture** | PostCard renders inline player directly in card when active | ✅ PASS |

**Total:** 22/22 Batch 9.2.1 Tests Passed (100% success rate).

### Full Monorepo Typecheck:
`npm run typecheck` completed across all 9 workspaces with 0 errors:
- `@apnasamaj/admin` — 0 errors
- `@apnasamaj/api` — 0 errors
- `@apnasamaj/mobile` — 0 errors
- `@apnasamaj/web` — 0 errors
- `@apnasamaj/database` — 0 errors
- `@apnasamaj/i18n` — 0 errors
- `@apnasamaj/shared-types` — 0 errors
- `@apnasamaj/ui-config` — 0 errors
- `@apnasamaj/validation` — 0 errors

---

## 5. Security & Invariant Verification Checklist

- [x] **Explicit Tenant Context:** Requests continue passing tenant headers.
- [x] **Database Isolation:** No database mutations or migrations were executed.
- [x] **Zero Private Storage Exposure:** Private chat attachments remain strictly isolated; only public post media is streamed from public endpoints.
- [x] **No External Browser Redirection:** All videos play directly inside the native application interface.
- [x] **Low-RAM Stability:** Hardware decoders released synchronously on unmount and scroll-out.
- [x] **Git Safety:** Working tree inspected; no unauthorized pushes or commits.

---

## 6. Recommendations & Next Steps

1. **Commit & Push Authorization:**
   - Review modified files in `apps/mobile/` and tests.
   - Authorize Git commit and push for Batch 9.2 and Batch 9.2.1 combined.
2. **Next Feature / Batch:**
   - Proceed to Gupta tenant migration (Batch 9.1) or next mobile enhancement as prioritized.

