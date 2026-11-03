# Apna Samaj — Batch 3 Report
## Mobile Social Feed & Post Interactions

**Date:** 2026-11-03  
**Track:** Mobile Track (React Native / Expo SDK 52)  
**Status:** **Completed & Fully Verified**  

---

## 1. Executive Summary

Batch 3 implements the complete Apna Samaj community social feed and post interaction experience inside the React Native mobile application (`apps/mobile`), reusing 100% of existing backend APIs, database models, and localization resources.

The implementation is engineered specifically for low-end Android devices:
- **Zero Heavy Dependencies Added:** Uses pure React Native primitives (`FlatList`, `Image`, `Modal`, `Share`, `Linking`) with no bulky external UI or video frameworks.
- **Hermes Android Bundle:** Bundles into a compact **2.69 MB** bytecode file (`entry-7463d76a473cb9c09061163591ece6eb.hbc`).
- **Autoplay Disabled:** Video attachments show low-memory thumbnail previews with play overlays and delegate streaming cleanly without spawning heavy ExoPlayer instances inside list views.
- **Fail-Closed Multi-Tenancy:** All feed and post requests transmit `x-community-slug` and `Authorization: Bearer <token>` via the centralized API client.

---

## 2. Existing Feed APIs Inspected & Reused

No new backend endpoints or database changes were introduced. All functionality directly reuses the existing backend endpoints from `apps/api/src/modules/posts/posts.routes.ts`:

| Method | Endpoint | Description | Handled In Mobile Client |
|:---|:---|:---|:---|
| `GET` | `/api/v1/posts` | Paginated feed list with category and search filters | `postsApi.getFeed({ page, limit, type, search })` |
| `GET` | `/api/v1/posts/:id` | Single post retrieval with author, media, and counts | `postsApi.getPost(postId)` |
| `POST` | `/api/v1/posts/:id/like` | Like a post | `postsApi.likePost(postId)` |
| `DELETE` | `/api/v1/posts/:id/like` | Unlike a post | `postsApi.unlikePost(postId)` |
| `GET` | `/api/v1/posts/:id/comments` | Paginated comments list | `postsApi.getComments(postId, page, limit)` |
| `POST` | `/api/v1/posts/:id/comments` | Create new comment with rate limiting | `postsApi.createComment(postId, content)` |
| `POST` | `/api/v1/posts/:id/view` | Record authenticated view analytics | `postsApi.recordView(postId)` |

---

## 3. Screens Implemented

### 1. Home Social Feed Screen (`apps/mobile/app/(app)/index.tsx`)
- **Top Navigation Bar:** Community logo initial `अ`, active community slug badge, one-touch Hindi/English toggle pill, and member profile avatar button.
- **Category Filter Chips:** Fast pill selectors for `ALL` ("सभी"), `GENERAL` ("सामान्य"), `ANNOUNCEMENT` ("सूचनाएं"), and `EVENT` ("आयोजन").
- **Search Input:** Search bar with clear button (`✕`) and enter-key submission.
- **Optimized FlatList:** Server-side pagination, pull-to-refresh (`RefreshControl`), `onEndReached` with mutex locking, deduplication by post ID, and stable keys.
- **Empty / Error States:** High-contrast error card with retry button, empty category/search state with refresh trigger, and initial spinner.
- **Member Profile & Tenant Modal:** Slide-up sheet displaying authenticated user profile details, tenant switcher, and session logout.

### 2. Post Details & Comments Screen (`apps/mobile/app/(app)/post/[id].tsx`)
- **Dynamic Route:** Resolves via Expo Router parameter `/(app)/post/[id]`.
- **Full Post Presentation:** Full post title, post content, full author metadata, city/state, pinned status, post type badge, and media.
- **View Recording:** Automatically calls `postsApi.recordView(id)` on mount for backend analytics.
- **Comments Stream:** Displays comments count, paginated comments list (`CommentItem`), and "और कमेंट देखें / Load more comments" button.
- **Fixed Bottom Composer:** Keyboard-aware sticky comment bar with multiline input, send button with loading state, and re-entrancy protection. Appends comments immediately upon creation.

---

## 4. Post Interaction Implementation

- **Like / Unlike:** Optimistically updates `isLikedByMe` and increments/decrements `likesCount`. If the server request fails, reverts smoothly. Includes `isLikePending` guard against rapid double-taps.
- **Open Post Details:** Tapping a post card or the comment button transitions via `router.push({ pathname: '/(app)/post/[id]', params: { id } })`.
- **View & Add Comments:** Comments are fetched in pages of 10. Creating a comment sends `{ content: trimmed }` to `POST /api/v1/posts/:id/comments`. The newly created comment is prepended to the comments list and the count is incremented.
- **Native Share Sheet:** Built-in `Share.share` from `react-native` shares the post title, content excerpt, and community name to WhatsApp, Telegram, SMS, or system dialogs.

---

## 5. Image & Video Performance Strategy

### Images
- Rendered via native `<Image source={{ uri: m.thumbnail || m.url }} />`.
- Fixed 200dp preview height with `resizeMode="cover"` and subtle rounded corners (`borderRadius.md`).
- Multi-image pill (`+N`) for posts with multiple photos, preventing simultaneous decoding of off-screen images.

### Videos
- **Autoplay is strictly disabled** across the entire mobile application.
- FlatList items render video thumbnail previews with a centered play overlay button (▶) and "वीडियो देखें / Watch Video" callout.
- Tapping the video preview opens [`VideoModal`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/mobile/src/components/feed/VideoModal.tsx).
- Video playback delegates cleanly via `Linking.openURL(media.url)`, allowing playback in system or user-preferred media players without instantiating heavy ExoPlayer instances inside list views.
- Zero memory leakage when navigating between screens.

---

## 6. List Performance & Pagination

- **Strategy:** Server-side pagination using `page` and `limit` matching existing backend contracts.
- **Infinite Scrolling:** `FlatList` triggers `onEndReached` with `onEndReachedThreshold={0.4}`.
- **Mutex Guard:** `isFetchingRef` prevents duplicate simultaneous pagination requests.
- **Client Deduplication:** Appended pages use `Set<string>` over post IDs to prevent duplicate keys if new posts were published while scrolling.
- **Pull to Refresh:** Native `RefreshControl` resets page to 1 and reloads data cleanly.

---

## 7. Tenant Isolation & Security

- **Headers:** Centralized `apiClient` automatically sets `x-community-slug: <activeSlug>` and `Authorization: Bearer <accessToken>`.
- **Backend Boundary Guard:** Requests are authenticated against the resolved tenant database via `req.db` and guarded by `assertDb(req.db)`.
- **Session Expiry:** HTTP 401 triggers token refresh; if refresh fails, SecureStore tokens are cleared and user is redirected to `/(auth)/login`.
- **Direct Database Access:** Zero PostgreSQL connection strings or Prisma clients are embedded in the mobile client.

---

## 8. Dependencies Added & Justification

**Zero new external npm packages were added.**  
All features were built using:
- `react-native` built-in components (`FlatList`, `Image`, `Modal`, `Pressable`, `Share`, `Linking`, `KeyboardAvoidingView`, `RefreshControl`)
- `expo-router` for file-based navigation
- `@apnasamaj/shared-types` for data types
- `@apnasamaj/i18n` for Hindi and English translations

---

## 9. Verification & Test Results

### 1. Mobile Automated Test Suites
```bash
npm test --workspace=@apnasamaj/mobile
```
**Results:** **52/52 tests passed (100% pass rate)**
- **Batch 1 & 1.1 Foundation Tests:** 22/22 passed
- **Batch 2 Auth Flow Tests:** 17/17 passed
- **Batch 2.1 Auth Security & Verification Tests:** 5/5 passed
- **Batch 3 Feed & Interactions Tests:** 8/8 passed
  - `postsApi` query structure and contract definitions
  - `PostItem` data modeling (title, pinned, types, media)
  - `formatRelativeTime` Hindi and English intervals
  - Feed pagination and deduplication logic
  - Optimistic like toggle logic
  - Comment creation and count updates
  - Multi-tenant `x-community-slug` header injection

### 2. Full Monorepo Typecheck
```bash
npm run typecheck
```
**Results:** **0 errors across all 9 workspaces**:
- `@apnasamaj/admin`: 0 errors
- `@apnasamaj/api`: 0 errors
- `@apnasamaj/mobile`: 0 errors
- `@apnasamaj/web`: 0 errors
- `@apnasamaj/database`: 0 errors
- `@apnasamaj/i18n`: 0 errors
- `@apnasamaj/shared-types`: 0 errors
- `@apnasamaj/ui-config`: 0 errors
- `@apnasamaj/validation`: 0 errors

### 3. Hermes Android Bytecode Compilation & Bundling
```bash
cd apps/mobile; npx expo export --platform android
```
**Results:**
- Bundled in 7,240 ms across 959 modules.
- Android bytecode bundle: `_expo/static/js/android/entry-7463d76a473cb9c09061163591ece6eb.hbc` (**2.69 MB**).
- Zero bundling errors or asset resolution warnings.

---

## 10. Status & Remaining Limitations

| Area | Status | Notes |
|:---|:---:|:---|
| **Home Social Feed** | **Completed & Verified** | Category filter, search, pagination, pull-to-refresh. |
| **Post Details & Comments** | **Completed & Verified** | Full post card, paginated comments, sticky composer. |
| **Post Interactions** | **Completed & Verified** | Like/unlike, view comments, add comment, share sheet. |
| **Media Handling** | **Completed & Verified** | Scaled images, video thumbnail preview with play action. |
| **Localization** | **Completed & Verified** | Hindi-first with 100% English parity. |
| **Physical Android Device** | **Unverified on Physical Hardware** | Tested via headless Node test runner and Hermes compiler. |

---

## 11. Next Recommended Batch

**Batch 3.1 (Mobile Track) — Mobile Post Creation & Image Upload**
- Post creation composer screen (`/(app)/post/create.tsx`)
- Camera & gallery image picking via `expo-image-picker`
- Image compression and upload to `POST /api/v1/posts/media/upload`
- Post type selector (General, Announcement, Event)
- Post title support (optional for General, required for Announcement/Event)

