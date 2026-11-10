# Apna Samaj — Batch 9.2: Unified In-App Video Player & Playback Optimization Report

**Batch ID:** Batch 9.2  
**Feature Track:** Mobile Application (`@apnasamaj/mobile`)  
**Implementation Date:** November 10, 2026  
**Authoritative Git Checkpoint:** `b1edf9b3b89511efb677f37858b33908cf3677f2` (`b1edf9b`)  
**Scope:** In-app video playback experience across Social Feed, Post Details, and Chat. Supports both official YouTube embeds and direct user-uploaded videos without external browser redirection.  

---

## 1. Executive Summary

In Batch 9.2, the video playback experience across the **Apna Samaj Mobile Application** was unified, modernized, and optimized for low-RAM budget Android devices and iOS devices.

### Prior State & Defect:
Previously, clicking an attached video in the Social Feed or Post Details opened a simple placeholder modal (`VideoModal.tsx`) with a "Play Video" button that called `Linking.openURL(media.url)`. This kicked the user completely out of the Apna Samaj app into an external browser (e.g. Chrome) or third-party video app, losing the user's active reading context and position in the community feed.

### Solution Delivered:
1. **Automatic Video Source Routing:** The application automatically inspects the video URL using `identifyVideoSource()`:
   - **`YOUTUBE`:** Renders the official YouTube embedded player via `YouTubeVideoPlayer` without opening an external browser.
   - **`UPLOADED_VIDEO`:** Renders the native `expo-av` stream player via `NativeVideoPlayer` with custom playback controls.
2. **Unified In-App Modal Experience:** Built `UnifiedVideoModal` (with backward-compatible proxy in `VideoModal.tsx`), supporting fullscreen playback, portrait/landscape responsiveness, and seamless dismissal.
3. **Low-RAM & Low-Resource Safety:** Video decoder resources are **never** initialized on feed cards in the FlatList. Only thumbnail previews with distinct source badges (`🔴 YouTube` vs `🎥 Video`) are rendered. Video players are mounted strictly on-demand when the user taps to play, and are unloaded immediately upon modal dismissal.
4. **Hardware Back Button Handling:** Integrated React Native `BackHandler` on Android so pressing the hardware back button cleanly closes the player and returns the user to the exact same Feed scroll offset without reloading.

---

## 2. Video Player Architecture & Dependencies

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   Unified In-App Video Experience                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
                     identifyVideoSource(media.url)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
               [ YOUTUBE ]                 [ UPLOADED_VIDEO ]
                    │                               │
                    ▼                               ▼
       YouTubeVideoPlayer.tsx              NativeVideoPlayer.tsx
       ──────────────────────              ─────────────────────
       • react-native-webview (Native)     • expo-av <Video>
       • Standard <iframe> (Web)           • Custom Controls Overlay
       • youtube-nocookie.com embed        • Play / Pause / Seek / Mute
       • Autoplay & Inline playback        • Time display (mm:ss)
       • Official YouTube JS API           • Fullscreen toggle
       • Zero external redirection         • Immediate unload on unmount
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                          UnifiedVideoModal.tsx
                          ─────────────────────
                          • Android Hardware Back
                          • Feed Position Lock
                          • Source Badges
```

### Dependencies Reused & Added:
1. **`expo-av` (~15.0.2):** Reused existing installed Expo dependency for native MP4/WebM/HLS video playback and audio decoding.
2. **`react-native-webview` (13.12.5):** Added official Expo SDK 52-compatible webview for embedding the official YouTube player securely inside native Android and iOS viewports without external browser redirection.
3. **`@apnasamaj/validation`:** Reused canonical `parseYouTubeUrl()` for sanitizing YouTube URLs, extracting 11-char video IDs, and generating privacy-enhanced `youtube-nocookie.com` embed URLs.

---

## 3. YouTube In-App Playback Implementation

- **Component:** [`apps/mobile/src/components/video/YouTubeVideoPlayer.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/components/video/YouTubeVideoPlayer.tsx)
- **Embed URL Canonicalization:** Transforms all valid YouTube URL variants (`youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`, embed URLs) into `https://www.youtube-nocookie.com/embed/{id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`.
- **Start Time Support:** Parses `t=...` or `start=...` parameters (e.g. `1m30s` -> `90s`) and preserves start time in the embed URL.
- **Platform Adaptability:**
  - **Native (Android / iOS):** Uses `react-native-webview` with `allowsFullscreenVideo`, `allowsInlineMediaPlayback`, and DOM storage enabled.
  - **Web (`Platform.OS === 'web'`):** Renders a responsive standard HTML5 `<iframe>` with `allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"`.
- **Thumbnail Optimization:** Resolves `https://img.youtube.com/vi/{id}/hqdefault.jpg` automatically if a post has no pre-saved thumbnail.
- **Compliance & Branding:** Respects YouTube Terms of Service by using the official embed player. Does not scrape or re-host direct video streams.

---

## 4. User-Uploaded Video Playback Implementation

- **Component:** [`apps/mobile/src/components/video/NativeVideoPlayer.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/components/video/NativeVideoPlayer.tsx)
- **Supported Formats:** `.mp4`, `.webm`, `.mov`, `.m3u8`, `.ogg`, and private Supabase storage URLs.
- **Controls & Interaction:**
  - Big center Play/Pause overlay badge.
  - Auto-fading bottom controls bar (disappears after 3.5 seconds of continuous playback).
  - Seek progress scrubber supporting touch and drag.
  - Timestamp indicator (`formatVideoDuration`: `mm:ss` or `hh:mm:ss`).
  - Audio mute/unmute toggle.
  - Fullscreen toggle with aspect ratio adjustment (`CONTAIN` in fullscreen, `COVER` in inline modal).
- **Network Resilience:**
  - Buffering indicator with `ActivityIndicator` during network lag.
  - Playback error card with localized retry button (`पुनः प्रयास करें` / `Retry`).
- **Private Attachment Resolution:** Normalizes legacy storage keys and local streaming dev endpoints (`/api/v1/chat/attachments/raw/*`) via `resolveVideoPlaybackUrl()`.

---

## 5. Low-RAM & Performance Optimizations (Budget Android Focus)

Budget Android handsets (2GB–3GB RAM) are vulnerable to Out-Of-Memory (OOM) crashes if video decoders are initialized inside list views. The following invariants are strictly enforced:

1. **Lazy Initialization:** Zero `<Video>` or `<WebView>` components are rendered inside feed `FlatList` items. Posts render lightweight static image thumbnails with play icon overlays.
2. **Single Active Player Constraint:** Only 1 video player can be instantiated at any given time.
3. **Immediate Decoder Unload:**
   ```typescript
   useEffect(() => {
     return () => {
       if (videoRef.current) {
         videoRef.current.unloadAsync().catch(() => {});
       }
     };
   }, []);
   ```
   When the modal is closed, `unloadAsync()` is called immediately to free hardware decoder handles.
4. **Android Hardware Back Handling:** Pressing the Android back button closes the modal and consumes the event, avoiding unwanted navigation stack resets or feed re-fetching.
5. **Feed Position Lock:** The user returns to their exact scroll position in the Feed without triggering a full page reload or list re-render.

---

## 6. Verification & Automated Test Results

A dedicated test suite was created in [`apps/mobile/src/tests/unified-video-player.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/tests/unified-video-player.test.ts) and registered in `test-runner.ts`:

| # | Test Verification Item | Result | Status |
|:---:|:---|:---:|:---:|
| 1 | Identifies standard `youtube.com/watch` URL | Passed | **PASS** |
| 2 | Extracts 11-char ID from watch URL | Passed | **PASS** |
| 3 | Identifies `youtu.be` short URL | Passed | **PASS** |
| 4 | Extracts 11-char ID from short URL | Passed | **PASS** |
| 5 | Identifies `youtube.com/shorts` URL | Passed | **PASS** |
| 6 | Extracts ID from Shorts URL | Passed | **PASS** |
| 7 | Identifies `youtube-nocookie.com` embed URL | Passed | **PASS** |
| 8 | Extracts ID from embed URL | Passed | **PASS** |
| 9 | Preserves start time (`t=1m30s` -> `start=90`) in embed URL | Passed | **PASS** |
| 10 | Generates privacy-enhanced embed URL | Passed | **PASS** |
| 11 | Sets autoplay parameter (`autoplay=1`) for in-app player | Passed | **PASS** |
| 12 | Generates standard `hqdefault.jpg` thumbnail | Passed | **PASS** |
| 13 | Rejects spoofed domain `not-youtube.com` | Passed | **PASS** |
| 14 | Rejects `javascript:` URI scheme | Passed | **PASS** |
| 15 | Rejects empty string | Passed | **PASS** |
| 16 | Rejects null input safely | Passed | **PASS** |
| 17 | Routes YouTube URL to `YOUTUBE` source | Passed | **PASS** |
| 18 | Routes `youtu.be` to `YOUTUBE` source | Passed | **PASS** |
| 19 | Routes Supabase MP4 to `UPLOADED_VIDEO` source | Passed | **PASS** |
| 20 | Routes WebM video to `UPLOADED_VIDEO` source | Passed | **PASS** |
| 21 | Routes HLS m3u8 stream to `UPLOADED_VIDEO` source | Passed | **PASS** |
| 22 | Routes local proxied attachment to `UPLOADED_VIDEO` source | Passed | **PASS** |
| 23 | Routes invalid non-http string to `UNKNOWN` source | Passed | **PASS** |
| 24 | Video source details has `sourceType = YOUTUBE` | Passed | **PASS** |
| 25 | Video source details captures `youtubeId` | Passed | **PASS** |
| 26 | Video source details resolves thumbnail | Passed | **PASS** |
| 27 | Video source details has `sourceType = UPLOADED_VIDEO` | Passed | **PASS** |
| 28 | Direct video has `youtubeId = null` | Passed | **PASS** |
| 29 | Direct video preserves supplied thumbnail | Passed | **PASS** |
| 30 | Resolves local attachment path through streaming endpoint | Passed | **PASS** |
| 31 | Formats 0ms as `00:00` | Passed | **PASS** |
| 32 | Formats 45s as `00:45` | Passed | **PASS** |
| 33 | Formats 125s as `02:05` | Passed | **PASS** |
| 34 | Formats 1h 2m 5s as `01:02:05` | Passed | **PASS** |
| 35 | Handles negative duration safely | Passed | **PASS** |
| 36 | Only 1 active player is instantiated when video is clicked | Passed | **PASS** |
| 37 | Video decoder handles are immediately released on modal close | Passed | **PASS** |
| 38 | Zero residual player handles after multiple open/close cycles | Passed | **PASS** |
| 39 | Android hardware back closes video player without exiting app | Passed | **PASS** |
| 40 | Modal state is set to closed | Passed | **PASS** |
| 41 | User returns to exact same Feed scroll position (840px) | Passed | **PASS** |
| **—** | **Full Mobile Test Runner (21 suites, 297 total assertions)** | **297 / 297 Passed** | **PASS** |
| **—** | **Monorepo Typecheck (`npm run typecheck` across all 9 workspaces)** | **0 Errors** | **PASS** |

---

## 7. Future Scope: YouTube Like & Subscribe

In compliance with Batch 9.2 constraints, Google OAuth and YouTube Like/Subscribe functionality were **not** implemented in this batch. 

### Future Technical Requirements for YouTube Engagement:
1. **Google OAuth 2.0:** Requires registering an Android SHA-1 fingerprint and iOS bundle identifier in the Google Cloud Console.
2. **Scope Authorization:** Requires requesting `https://www.googleapis.com/auth/youtube.force-ssl`.
3. **YouTube Data API v3:** Requires backend endpoints to proxy `POST /youtube/v3/videos/rate` (Like/Dislike) and `POST /youtube/v3/subscriptions` (Subscribe).
4. **Separation of Concerns:** Apna Samaj community likes and comments remain separate from YouTube video metrics.

---

## 8. Physical Device Testing Requirements

- **Automated Tests:** Verified (41 / 41 video assertions, 297 cumulative mobile assertions passed).
- **Simulated Tests:** Verified on Expo Web and Node mock environments.
- **Physical Device Testing:** **Pending physical handset run**. Requires running on real OEM Android devices (e.g. Xiaomi MIUI, Samsung OneUI) to test hardware orientation rotation (sensor landscape), physical speaker volume buttons, and OEM background app switching.

---

## 9. Modified & Created Files Summary

1. `apps/mobile/src/utils/video.ts` (New — Video source identification, embed URL builder, duration formatter).
2. `apps/mobile/src/components/video/NativeVideoPlayer.tsx` (New — Native `expo-av` player with custom controls, seek bar, time display, mute, fullscreen, buffer/error states).
3. `apps/mobile/src/components/video/YouTubeVideoPlayer.tsx` (New — Embedded YouTube player with `react-native-webview` / `iframe`, privacy-enhanced `youtube-nocookie.com`, fullscreen).
4. `apps/mobile/src/components/video/UnifiedVideoModal.tsx` (New — Unified in-app modal with source badges, title, fullscreen, Android hardware back handler).
5. `apps/mobile/src/components/video/index.ts` (New — Video module re-exports).
6. `apps/mobile/src/components/feed/VideoModal.tsx` (Modified — Backward-compatible proxy to `UnifiedVideoModal`).
7. `apps/mobile/src/components/feed/PostCard.tsx` (Modified — Added video source badge pills `🔴 YouTube` / `🎥 Video`, direct in-app play trigger).
8. `apps/mobile/app/(app)/index.tsx` (Modified — Feed screen video player integration with title/author forwarding).
9. `apps/mobile/app/(app)/post/[id].tsx` (Modified — Post details video player integration).
10. `apps/mobile/src/components/chat/ChatVideoMessage.tsx` (Modified — Direct in-app video playback in chat messages).
11. `apps/mobile/src/components/index.ts` (Modified — Exported video components).
12. `apps/mobile/src/tests/unified-video-player.test.ts` (New — 41 automated test assertions).
13. `apps/mobile/src/tests/test-runner.ts` (Modified — Registered Batch 9.2 test suite).
14. `apps/mobile/package.json` & `package-lock.json` (Modified — Added `react-native-webview` 13.12.5).
15. `docs/MOBILE_APP_DEVELOPMENT_DASHBOARD.md` (Modified — Updated Batch 9.2 progress and metrics).
16. `docs/PROJECT_HISTORY.md` (Modified — Recorded Batch 9.2 in Sections E and F).
17. `docs/BATCH_9_2_UNIFIED_VIDEO_PLAYER_REPORT.md` (New — Authoritative Batch 9.2 report).

