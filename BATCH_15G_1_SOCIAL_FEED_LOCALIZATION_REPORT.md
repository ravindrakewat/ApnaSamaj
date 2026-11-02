# Apna Samaj — Batch 15G.1 Report
## Social Feed Localization (Hindi / English)

**Date:** 2026-11-02  
**Status:** **Completed & Verified**  
**Repository Branch:** `main`  
**Base HEAD:** `58493f74b1724b80433ebe59b0ba08cc5b6cd4b1` (`58493f7`)  
**Working Tree State:** Modified (Uncommitted — Ready for safe checkpoint audit)

---

## 1. Executive Summary

Batch 15G.1 extends Apna Samaj's multilingual architecture to the Social Feed module across the Member Portal (`apps/web`). The existing shared `@apnasamaj/i18n` package was enhanced with a dedicated `feed` namespace supporting authentic, culturally natural Hindi (the platform default) and clear English translations with 100% key parity.

The Feed UI components—[`FeedPage.tsx`](apps/web/src/pages/FeedPage.tsx), [`CreatePostComposer.tsx`](apps/web/src/components/CreatePostComposer.tsx), [`PostCard.tsx`](apps/web/src/components/PostCard.tsx), and [`PostDetailPage.tsx`](apps/web/src/pages/PostDetailPage.tsx)—were refactored to replace all hardcoded strings and ad-hoc bilingual slashes (`"All Posts / सभी"`, `"General / सामान्य"`, etc.) with dynamic i18n hooks. Switching languages via the Navbar `LanguageSelector` now updates the entire feed chrome, action labels, empty states, dialogs, and relative timestamps dynamically without requiring a page reload.

In strict adherence to platform multi-tenant and privacy invariants, user-generated post text, comment content, author names, and community/group names remain untouched and untranslated.

---

## 2. Shared i18n Package Enhancements (`packages/i18n`)

1. **Namespace Registration:**
   - Added `'feed'` to `TRANSLATION_NAMESPACES` in [`packages/i18n/src/constants.ts`](packages/i18n/src/constants.ts).
   - Exported `FeedTranslationKey` and updated `TranslationSchema` in [`packages/i18n/src/types.ts`](packages/i18n/src/types.ts).
   - Registered `feedHi` and `feedEn` in the central resources dictionary in [`packages/i18n/src/resources.ts`](packages/i18n/src/resources.ts).
2. **Translation Resource Files:**
   - **Hindi (`packages/i18n/src/locales/hi/feed.json`):** 90+ authentic Devanagari translation keys with natural terminology.
   - **English (`packages/i18n/src/locales/en/feed.json`):** 90+ parallel English translation keys.
   - **Key Parity:** Verified 1:1 key parity between English and Hindi resources (0 missing keys).

---

## 3. Component Localization Breakdown

### A. [`FeedPage.tsx`](apps/web/src/pages/FeedPage.tsx)
- **Header & Chrome:** Localized page title (`title`: "समाज फ़ीड" / "Community Feed"), subtitle (`subtitle`), and refresh feed button (`refresh`, `refreshAria`).
- **Search & Clear:** Localized search input placeholder (`searchPlaceholder`: "समाज की पोस्ट खोजें..." / "Search community posts...") and ARIA labels (`searchAria`, `clearSearchAria`).
- **Filter Chips:** Replaced ad-hoc bilingual slashes with single active language labels:
  - All Posts (`filterAll`: "सभी पोस्ट" / "All Posts")
  - General (`filterGeneral`: "सामान्य" / "General")
  - Announcements (`filterAnnouncements`: "सूचनाएं" / "Announcements")
  - Events (`filterEvents`: "आयोजन" / "Events")
- **Counts & Pagination:** Bounded post counts with pluralization (`totalPostsCount`, `showingPostsMeta`, `pageMeta`).
- **Empty States:** Dynamic messages for filtered search queries (`emptySearchResults`), category-specific empties (`emptyCategory`), and general empty feed (`emptyFeedGeneric`).
- **Errors & Retries:** Localized feed loading failure message (`loadFeedError`) and retry action (`common:retry`).

### B. [`CreatePostComposer.tsx`](apps/web/src/components/CreatePostComposer.tsx)
- **Header & Prompts:** Localized default member label (`composerDefaultAuthor`), composer subtitle (`composerSubtitle`), and textarea prompt (`composerPlaceholder`).
- **Post Types:** Dynamic post type dropdown options (`postTypeGeneral`, `postTypeEvent`, `postTypeAnnouncement`).
- **Media Upload Controls:** Photo picker count button (`composerPhoto`), photo limit tooltips (`composerPhotoTooltip`, `composerMaxPhotosTooltip`), remove media ARIA label (`removeMediaAria`), and upload status (`uploadFailed`).
- **YouTube Embed Modal:** Modal title (`youtubeModalTitle`), URL input placeholder (`youtubeModalPlaceholder`), modal action buttons (`add`, `common:cancel`), and attached video card titles (`composerYoutubeAttachedTitle`).
- **Validation Messages:** Client-side error notifications for image limits (`maxImagesExceeded`), unsupported formats (`unsupportedImageFormat`), file size limits (`imageSizeExceeded`), content presence (`contentOrMediaRequired`), and YouTube URL checks (`youtubeRequired`, `youtubeInvalid`).
- **Character Counter & Submission:** Remaining characters (`charsLeft`), submit button states (`publishPost`, `publishing`).

### C. [`PostCard.tsx`](apps/web/src/components/PostCard.tsx)
- **Post Types & Badges:** Localized post type badges (`postTypeGeneral`, `postTypeEvent`, `postTypeAnnouncement`) and pinned chip (`pinned`).
- **Relative Timestamps:** Replaced hardcoded `toLocaleDateString('en-IN')` with existing `formatRelativeTime(post.createdAt, i18n.language)` and `formatRelativeTime(comment.createdAt, i18n.language)`. Added `(edited)` indicator (`edited`).
- **Media Fallbacks:** Graceful fallback labels for missing images (`imageUnavailable`), broken video files (`videoUnavailable`, `videoUnavailableDesc`), and external YouTube links (`watchOnYoutube`).
- **Post Action Dropdown Menu:** Localized all menu options (`copyLink`, `viewPostDetails`, `pinPost`, `unpinPost`, `editPost`, `deletePost`, `moderateDeletePost`, `reportPost`).
- **Interaction Buttons & Analytics:**
  - Like button with singular/plural count formatting (`like`, `likeWithCount`, `likeWithCount_plural`).
  - Comment toggle button with singular/plural count formatting (`comment`, `commentWithCount`, `commentWithCount_plural`).
  - Share action button (`share`) and fallback menu items (`shareWhatsApp`, `copyLink`).
  - View analytics reach indicator (`viewsTooltip`, `viewsAndMembers`, `adminControlEnabled`).
- **Comments Section:**
  - Comment composer placeholder (`writeCommentPlaceholder`) and submit states (`submitComment`, `submittingComment`).
  - Empty comments message (`noCommentsYet`).
  - Comment item action tooltips (`editComment`, `deleteComment`, `moderateDeleteComment`).
  - Load more comments button and spinner (`loadMoreComments`, `loadingComments`).
  - Delete comment confirmation dialog (`confirmDeleteCommentTitle`, `confirmDeleteCommentModerator`, `confirmDeleteCommentUser`).
- **Post Edit & Delete Dialogs:**
  - Edit post dialog title (`editPostTitle`), fields (`editPostContentLabel`, `editPostContentPlaceholder`), image count (`attachedImagesCount`), upload button (`addImages`, `uploading`), and save button (`saveChanges`).
  - Delete post confirmation dialog (`confirmDeletePostTitle`, `confirmDeletePostModerator`, `confirmDeletePostUser`, `deleting`).
- **Post Reporting Dialog:**
  - Report dialog title (`reportPostTitle`), description (`reportPostDesc`), reason select (`reportReasonLabel`), and localized reasons (`reportReasonInappropriate`, `reportReasonSpam`, `reportReasonHarassment`, `reportReasonHate`, `reportReasonMisinformation`, `reportReasonOther`).
  - Feedback toasts for link copying (`copyLinkSuccess`, `copyLinkPrivateNotice`, `copyLinkFailed`) and reporting (`reportSubmitted`, `reportFailed`).

### D. [`PostDetailPage.tsx`](apps/web/src/pages/PostDetailPage.tsx)
- **Navigation & Breadcrumbs:** Back button (`backToFeed`, `backToGroup`), breadcrumb links (`breadcrumbFeed`, `breadcrumbPost`), and refresh action (`common:refresh`).
- **Loading & Unavailable States:** Loading skeleton text (`postDetailsLoading`), post unavailable alert (`postUnavailableTitle`, `postUnavailableDesc`), and navigation buttons (`goToFeed`, `exploreGroups`).

---

## 4. Date & Time Formatting Integration

Rather than duplicating date formatting logic, the social feed reuses the platform's relative-time utility ([`apps/web/src/utils/notifications.ts`](apps/web/src/utils/notifications.ts)), passing the active language:
- `< 60s`: "अभी" / "Just now"
- Minutes: "1 मिनट पहले", "5 मिनट पहले" / "1 minute ago", "5 minutes ago"
- Hours: "1 घंटा पहले", "2 घंटे पहले" / "1 hour ago", "2 hours ago"
- Yesterday: "कल" / "Yesterday"
- Days (<7d): "3 दिन पहले" / "3 days ago"
- Older: Formatted via `toLocaleDateString('hi-IN')` or `toLocaleDateString('en-US')`.

---

## 5. Automated Verification Results

### A. New Social Feed Localization UX Test Suite
Command: `npx tsx apps/web/src/tests/feed-localization-ux.test.ts`
- **Result:** **25 Passed, 0 Failed (100% Pass)**
- **Coverage:**
  1. Hindi Feed UI Resources (title, filters, composer, post types, actions)
  2. English Feed UI Resources (title, filters, composer, post types, actions)
  3. 1:1 Translation Key Parity between English and Hindi (90+ keys, 0 missing)
  4. Dynamic Language Switching (Hindi <-> English without page reload)
  5. Post Type Labels in both languages
  6. Action counts & pluralization (likes, comments, views & members)
  7. Localized relative timestamps (just now, minutes, hours, yesterday, days)
  8. Composer validation error messages & image bounds
  9. Empty and error states with dynamic query interpolation
  10. Post action menus, confirmation dialogs, and reporting categories
  11. Post detail page navigation, breadcrumbs, and unavailable states

### B. Existing Regression Suites
- `apps/web/src/tests/notifications-localization-ux.test.ts`: **31 Passed, 0 Failed**
- `apps/web/src/tests/multilingual-foundation.test.ts`: **26 Passed, 0 Failed**
- `apps/web/src/tests/social-feed-frontend-ux.test.ts`: **27 Passed, 0 Failed**
- `apps/web/src/tests/post-detail-deep-linking.test.ts`: **34 Passed, 0 Failed**

### C. Monorepo Typecheck & Production Build
- `npm run typecheck`: **Clean across all 8 workspaces (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`) (Exit code 0)**.
- `npm run build --workspace=@apnasamaj/i18n`: **Built successfully (`tsc`) (Exit code 0)**.
- `npm run build --workspace=@apnasamaj/web`: **Built successfully (`tsc && vite build`) (Exit code 0, 11796 modules transformed)**.

---

## 6. Files Changed & Staging Manifest

| File Path | Type | Scope |
|:---|:---|:---|
| `packages/i18n/src/constants.ts` | Modified | Registered `'feed'` namespace in `TRANSLATION_NAMESPACES`. |
| `packages/i18n/src/types.ts` | Modified | Added `feed` to `TranslationSchema` and exported `FeedTranslationKey`. |
| `packages/i18n/src/resources.ts` | Modified | Imported and registered `feedHi` and `feedEn`. |
| `packages/i18n/src/locales/en/feed.json` | Created | Complete English feed translation resource. |
| `packages/i18n/src/locales/hi/feed.json` | Created | Complete Hindi feed translation resource. |
| `apps/web/src/pages/FeedPage.tsx` | Modified | Localized heading, search, filter chips, counts, empty states, and errors. |
| `apps/web/src/components/CreatePostComposer.tsx` | Modified | Localized composer prompts, post types, upload tooltips, validations, and YouTube modal. |
| `apps/web/src/components/PostCard.tsx` | Modified | Localized post types, actions, timestamps, menus, dialogs, comments, and reports. |
| `apps/web/src/pages/PostDetailPage.tsx` | Modified | Localized breadcrumbs, back button, refresh, and unavailable states. |
| `apps/web/src/tests/feed-localization-ux.test.ts` | Created | 25 automated unit and UX localization tests. |
| `docs/PROJECT_HISTORY.md` | Modified | Recorded Batch 15G.1 completion and current repository state. |
| `BATCH_15G_1_SOCIAL_FEED_LOCALIZATION_REPORT.md` | Created | Comprehensive batch implementation report. |

---

## 7. Safety & Invariant Confirmation

- **Zero Secrets Logged or Exposed:** No `.env`, API keys, tokens, or credentials touched.
- **Physical Multi-Tenant Database Isolation Preserved:** No database schema or queries modified.
- **User-Generated Content Isolation Preserved:** User post texts, comments, author names, and community/group names are strictly preserved in their original form and never passed to translation engines.
- **No Git Commit, Push, or Deploy Executed:** Implementation completed in the working tree; awaiting review and approval for safe checkpointing.

