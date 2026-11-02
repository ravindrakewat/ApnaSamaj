# Apna Samaj — Batch 15G.2 Technical Audit Report
## Direct Video Upload + YouTube Video Integration

**Date:** 2026-11-02  
**Status:** **Completed & Ready for Review**  
**Repository Branch:** `main`  
**Current HEAD:** `58493f74b1724b80433ebe59b0ba08cc5b6cd4b1` (`58493f7`)  
**Audit Scope:** STRICTLY READ-ONLY (No code modified, no packages installed, no database migrations run)

---

## 1. Executive Summary

This audit assesses the technical requirements, architecture, security, cost implications, and implementation sequence for adding **Direct Video Uploads** to the Apna Samaj Social Feed while preserving full compatibility with the existing **YouTube Video Embedding** and **Photo Upload** features.

The Apna Samaj codebase is in an advantageous position:
1. The **database schema** (`PostMedia` model and `MediaType.VIDEO` enum) already exists in Prisma and supports video records without any migration.
2. The **validation layer** (`@apnasamaj/validation`) already permits `mediaType: 'VIDEO'` with direct video URLs (`.mp4`, `.webm`, `.mov`, `.ogg`) as well as YouTube links, and strictly enforces the invariant of at most 1 video per post.
3. The **feed display component** (`PostCard.tsx`) already contains a fully implemented HTML5 `<video controls preload="metadata" ...>` player with poster previews and accessible fallback error states.

The primary work required for Batch 15G.2 is in:
- The **backend storage service & upload middleware** (adding video magic bytes validation, disk/stream upload handling, and bucket MIME type updates).
- The **frontend composer** (`CreatePostComposer.tsx`) (adding a video file picker, client-side duration and file size validation, composer video preview, and mutual exclusivity between YouTube and direct video).
- **Cost and bandwidth governance** (establishing balanced limits to prevent storage and egress cost explosions).

---

## 2. Current Implementation & Reusable Components

### A. Database Layer (`packages/database/prisma/schema.prisma`)
- **`model PostMedia`:**
  ```prisma
  model PostMedia {
    id        String    @id @default(uuid())
    postId    String
    post      Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
    mediaType MediaType @default(IMAGE)
    url       String
    thumbnail String?
    order     Int       @default(0)
    createdAt DateTime  @default(now())
    @@index([postId])
  }
  ```
- **`enum MediaType`:** Already includes `IMAGE`, `VIDEO`, `DOCUMENT`.
- **Status:** **100% Ready.** Zero database schema changes or migrations required.

### B. Validation Layer (`packages/validation/src/post.ts`)
- **`postMediaTypeEnum`:** Supports `['IMAGE', 'VIDEO', 'DOCUMENT']`.
- **`postMediaItemSchema`:** Already includes validation permitting `mediaType === 'VIDEO'` if the URL matches `/\.(mp4|webm|mov|ogg)($|\?)/i` or `/storage/v1/object/public/` or passes `parseYouTubeUrl`.
- **`createPostSchema`:**
  - Enforces maximum of 4 total media items per post.
  - Enforces `videoCount <= 1` across all attachments.
- **`parseYouTubeUrl`:** Provides 11-char ID extraction, start time parsing, tracking parameter removal, and `youtube-nocookie.com` embed generation.
- **Status:** **High Reusability.** Needs only a dedicated video upload file-bounds validation helper.

### C. Backend API (`apps/api`)
- **Upload Route:** `POST /api/v1/posts/media/upload` in `posts.routes.ts` currently handles image uploads via `singleImageUpload` middleware.
- **Middleware:** `upload.middleware.ts` uses `multer.memoryStorage()`, limits files to 5MB, and restricts MIME to `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- **Storage Service:** `storage.service.ts` uploads to Supabase Storage bucket (`config.supabaseStorageBucket`, default `post-media`). Paths are namespaced under `posts/${userId}/${uuid}.${ext}`.
- **Post Service:** `normalizePostMediaInputs` in `posts.service.ts` already maps direct video URLs to `DbMediaType.VIDEO`.
- **Status:** Needs a dedicated video upload endpoint or expanded upload middleware with stream/disk buffering.

### D. Frontend Member Portal (`apps/web`)
- **`PostCard.tsx`:**
  - Already has direct video rendering logic:
    ```tsx
    {videoItem && !parsedYt && (
      <Box sx={{ mt: 1.5, mb: 1, borderRadius: 2, overflow: 'hidden', bgcolor: '#000' }}>
        {failedVideoUrls.has(videoItem.url) ? (
          <Box ... role="alert" aria-label={t('videoUnavailable')}>
            <VideocamOffIcon sx={{ fontSize: 40, opacity: 0.6 }} />
            <Typography variant="body2">{t('videoUnavailable')}</Typography>
            <Typography variant="caption">{t('videoUnavailableDesc')}</Typography>
          </Box>
        ) : (
          <Box
            component="video"
            controls
            preload="metadata"
            src={videoItem.url}
            poster={videoItem.thumbnail || undefined}
            onError={() => handleVideoError(videoItem.url)}
            aria-label={`Video attachment from ${post.author.fullName}`}
            sx={{ width: '100%', maxHeight: 460, display: 'block' }}
          />
        )}
      </Box>
    )}
    ```
- **`CreatePostComposer.tsx`:**
  - Currently only has photo picker (`accept="image/*"`) and YouTube modal.
  - Needs a "Video" action button, client-side video duration validation (`HTMLVideoElement.duration`), and a video preview card with a remove button.
- **Status:** Rendering is complete; composer needs video selection and preview UI.

---

## 3. Recommended Storage Provider & Upload Architecture

### Architectural Challenge: Memory Safety in Node.js
The existing photo upload middleware uses `multer.memoryStorage()`, which buffers the entire uploaded file into Node.js heap memory (`Buffer`). While acceptable for 5MB images, buffering 30MB–50MB video files in memory on a single-threaded server (especially on hosting environments with 512MB RAM such as Render starter instances) risks Out-Of-Memory (OOM) crashes if multiple users upload concurrently.

### Evaluation of Upload Flows:

| Architecture Flow | API Memory Overhead | Implementation Complexity | Security & Tenant Isolation | Recommendation |
|:---|:---:|:---:|:---:|:---:|
| **Option A: Multer Memory Buffer** (Current photo pattern) | **HIGH (Risk of OOM crashes)** | Low | High (validated in controller) | **NOT Recommended for Videos > 10MB** |
| **Option B: Multer Disk Temp File + Supabase Upload Stream** | **LOW (Streams from disk)** | Low / Moderate | High (API validates magic bytes before upload) | **Recommended for Batch 15G.2** |
| **Option C: Direct-to-Supabase Presigned URL** | **ZERO (Direct browser to S3/Supabase)** | Moderate (Requires presigned upload token endpoint) | Moderate (Requires post-upload webhook or verification) | **Recommended for Future Scale** |

### Recommended Upload Flow for Batch 15G.2 (Option B):
1. **Client Preflight Check:** The browser loads the video file metadata in an offscreen `<video>` element to verify:
   - File size <= 30 MB.
   - Video duration <= 90 seconds (1.5 minutes).
   - Video format is MP4 or WebM.
   If checks fail, error is shown immediately without sending any bytes over the network.
2. **Upload to API:** Client uploads via `POST /api/v1/posts/media/video-upload` (authenticated, tenant-scoped).
3. **Disk Streaming:** API uses `multer.diskStorage()` to stream the video into an ephemeral temp file (`os.tmpdir()`), ensuring memory usage remains < 2MB regardless of video size.
4. **Binary Magic Bytes Validation:** API inspects the first 32 bytes of the temp file to verify legitimate MP4 (`ftyp` box) or WebM (`0x1A45DFA3`) signatures, rejecting disguised executable/script files.
5. **Upload to Supabase Storage:** Streamed to Supabase Storage under `posts/${userId}/${uuid}.${ext}`.
6. **Temp Cleanup:** Ephemeral temp file is deleted immediately in a `finally` block.
7. **Response:** API returns public URL, storage path, file size, and `mediaType: 'VIDEO'`.

---

## 4. Limit Recommendations & Cost Considerations

### Initial Product Preferences vs. Architectural Reality
- *Initial Preference:* 50 MB max file size, 2 minutes max duration.
- *Cost & Performance Analysis:*
  - **Supabase Storage Pricing:**
    - Free tier includes 1 GB storage and 2 GB egress bandwidth/month.
    - Paid tier: $0.021/GB storage, $0.09/GB egress bandwidth.
  - **Bandwidth Math:**
    - A 50 MB video viewed by 100 members consumes **5 GB** of egress bandwidth for just 1 post.
    - If 20 members post 50 MB videos, storage is exhausted (1 GB) and views quickly generate unexpected bandwidth bills.
  - **Mobile Experience in India (Target Demographic):**
    - High-bitrate 50 MB uncompressed phone videos take 20–40 seconds to upload on typical mobile networks and buffer heavily during playback.
  - **YouTube Advantage:**
    - YouTube provides **zero storage cost**, **zero bandwidth cost**, automated adaptive multi-resolution transcoding (144p to 1080p), and instant CDN streaming worldwide for free.

### Final Recommended Limits:

| Parameter | Recommended Limit | Justification |
|:---|:---:|:---|
| **Max Direct Video File Size** | **30 MB** (or 25 MB) | Prevents runaway egress costs while allowing crisp 720p 60-90s smartphone clips. |
| **Max Direct Video Duration** | **90 seconds** (1.5 minutes) | Sufficient for announcements, short greetings, and social clips. |
| **Supported Direct Formats** | **MP4 (`video/mp4`), WebM (`video/webm`)** | Natively supported by 100% of modern iOS, Android, and desktop browsers without transcoding. |
| **Long-Form / High-Res Videos** | **YouTube Embeds (Unlimited length)** | Ideal for speeches, cultural functions, community festivals, and marriages at zero cost to Apna Samaj. |

---

## 5. Required Changes Across Monorepo

### A. Shared Packages
1. **`@apnasamaj/validation`:**
   - Define `MAX_VIDEO_FILE_SIZE_BYTES = 30 * 1024 * 1024` (30 MB).
   - Define `MAX_VIDEO_DURATION_SECONDS = 90` (90s).
   - Export `ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm']`.
2. **`@apnasamaj/i18n`:**
   - Add localized keys to `feed.json` (`hi` and `en`):
     - `composerVideo`: "Upload Video" / "वीडियो अपलोड करें"
     - `videoSizeExceeded`: "Video exceeds the maximum size limit of {{max}}MB." / "वीडियो अधिकतम {{max}}MB आकार सीमा से अधिक है।"
     - `videoDurationExceeded`: "Video duration exceeds {{max}} seconds." / "वीडियो की अवधि अधिकतम {{max}} सेकंड से अधिक है।"
     - `unsupportedVideoFormat`: "Unsupported video format. Please upload an MP4 or WebM video." / "असमर्थित वीडियो प्रारूप। कृपया MP4 या WebM वीडियो चुनें।"
     - `videoAttached`: "Direct Video Attached" / "वीडियो संलग्न है"
     - `removeVideo`: "Remove video" / "वीडियो हटाएं"

### B. Backend API (`apps/api`)
1. **`storage.service.ts`:**
   - Implement `detectVideoMimeType(buffer: Buffer): 'video/mp4' | 'video/webm' | null` checking:
     - MP4: checks for `ftyp` box at byte offset 4 (`ftypisom`, `ftypmp42`, `ftypmp41`, `ftypdash`).
     - WebM: checks for EBML header `[0x1a, 0x45, 0xdf, 0xa3]`.
   - Implement `uploadPostVideo(userId, filePath, mimeType, originalName)` streaming from disk to Supabase Storage.
2. **`upload.middleware.ts`:**
   - Add `singleVideoUpload` middleware using `multer.diskStorage()`, with 30MB limit and video MIME filter.
3. **`posts.routes.ts` & `posts.controller.ts`:**
   - Register route `POST /api/v1/posts/media/video-upload` with `singleVideoUpload`.
   - Apply rate limiting (e.g. 10 video uploads per user per hour).
   - Ensure uploaded video cleanup if post creation fails.

### C. Frontend Member Portal (`apps/web`)
1. **`posts.service.ts`:**
   - Add `uploadPostVideoApi(file: File): Promise<UploadMediaResponseData>` calling `/api/v1/posts/media/video-upload`.
2. **`CreatePostComposer.tsx`:**
   - Add hidden `<input type="file" accept="video/mp4,video/webm" />`.
   - Add "Video" button next to "Photo" and "YouTube Video".
   - Client-side duration and size check via `URL.createObjectURL(file)` + offscreen `HTMLVideoElement`.
   - Video attachment preview card with thumbnail or `<video>` snippet and remove button.
   - Enforce single-video exclusivity: If direct video is attached, disable YouTube button; if YouTube is attached, disable Video button.

---

## 6. Security & Multi-Tenant Invariants

1. **Physical Tenant Isolation:** Post records and `PostMedia` relations are strictly saved via `req.db` and guarded by `assertDb(req.db)`.
2. **Storage Path Boundary:** Storage objects must always be written to `posts/${userId}/${uuid}.${ext}`. Users cannot overwrite files belonging to other users or other communities.
3. **MIME Spoofing Prevention:** Files claiming `.mp4` or `.webm` must pass binary magic bytes inspection before upload to Supabase. Renamed `.exe` or HTML scripts are rejected.
4. **Denial-of-Wallet & Resource Protection:**
   - Dedicated rate limiting on video upload endpoints.
   - Disk streaming prevents Node.js memory exhaustion.
   - Ephemeral temp files are removed immediately via `try...finally`.
5. **Autoplay & Player Security:**
   - `<video controls preload="metadata">` prevents automatic background downloads and unwanted audio playback.

---

## 7. Required Configuration & Blockers

1. **Supabase Bucket Allowed MIME Types:**
   - The bucket `post-media` in Supabase was originally created with:
     `allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']`.
   - **Action Required:** In `storage.service.ts`, update `ensureBucketExists()` so `allowedMimeTypes` includes `video/mp4` and `video/webm` (or is set to empty to allow configured media types).
2. **Environment Variables:**
   - Add optional `MAX_VIDEO_FILE_SIZE_BYTES` in `env.ts` with default fallback to `31457280` (30MB).
   - Zero secrets exposed; reuse existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

---

## 8. Test Plan & Implementation Sequence

### Phase 1: Shared Validation & i18n
- Add video bounds constants and schema in `@apnasamaj/validation`.
- Add video translation keys in `packages/i18n/src/locales/{en,hi}/feed.json`.
- Unit tests: verify video validation schema and i18n key parity.

### Phase 2: Backend Video Storage Service
- Implement `detectVideoMimeType` with magic bytes tests for valid MP4, valid WebM, invalid/fake video files.
- Implement `singleVideoUpload` middleware with disk streaming.
- Implement `uploadPostVideo` in `storage.service.ts`.
- Integration tests: test video upload route with auth, valid video, oversized video, invalid MIME, and temp file cleanup.

### Phase 3: Frontend Composer Integration
- Update `CreatePostComposer.tsx` with video file picker, duration preflight check, and video preview card.
- Enforce mutual exclusivity between direct video and YouTube embed.
- Frontend tests: test video attachment, duration rejection, single-video limit, and post payload creation.

### Phase 4: Full Monorepo Verification & Checkpoint
- Run full test suites: `post.media.test.ts`, `youtube-embedding.test.ts`, `feed-localization-ux.test.ts`, `youtube-rendering.test.ts`.
- Run full monorepo `npm run typecheck` across all 8 workspaces.
- Run workspace production builds (`@apnasamaj/i18n` and `@apnasamaj/web`).
- Prepare Batch 15G.2 completion report.

---

## 9. Final Recommendation

**Recommendation:** Proceed with implementation using **Option B (Multer Disk Stream to Supabase Storage)** with a **30 MB / 90-second limit** for direct video uploads, while keeping YouTube embedding front-and-center for long-form community videos. This leverages 90% of the existing codebase, prevents server memory crashes, preserves zero-migration database safety, and keeps monthly storage/bandwidth costs predictable.

*Awaiting your explicit review and approval before proceeding with any code implementation.*

