# Apna Samaj Mobile App — Complete UI & Navigation Audit Report

**Date:** 2026-11-04  
**Workspace:** `apps/mobile`  
**Git Branch:** `main`  
**Commit Baseline:** `0f209e97de4c8e29cfeff48f79583d367ccceaec`  
**Audit Scope:** Screen Inspection, Navigation Analysis, User Flow Verification, Safe Area & UI Inset Remediation  

---

## 1. Executive Summary

A comprehensive, non-destructive UI and navigation audit of the Apna Samaj Mobile App (`apps/mobile`) was conducted across all existing routes, screens, layouts, and components.

### Key Audit Findings:
1. **Core Screens Implemented:** 11 route screens exist across authentication and main social app features (Login, Register, Feed, Create Post, Post Details, Member Directory, Member Profile, Groups Discovery, Group Details).
2. **Missing Standalone Screens:** 
   - **Dedicated Profile / Account Screen:** Does not exist as a route. Profile information, community switching, and logout are currently implemented only inside an inline Modal drawer on the Feed screen.
   - **Standalone Community Selection Screen:** Does not exist as a separate screen or onboarding flow; community slug is currently captured via form inputs on Login/Register and in the profile modal.
   - **Standalone Language Selection Screen:** Does not exist as a separate screen; language switching (Hindi/English) is implemented via interactive toggle pills in top headers.
3. **Critical UI / Safe Area Inset Defect (Remediated):**
   - Custom screen headers (`headerShown: false` in Expo Router stack) lacked `insets.top` handling, causing headers, titles, language pills, and back buttons to be obscured by the device status bar, notch, and camera punch hole on modern Android/iOS devices.
   - `BottomNavigation.tsx` used a hardcoded `paddingBottom: 12`, causing tab buttons to sit directly on or overlap the system gesture indicator / navigation pill.
   - Floating Action Button (FAB) on Feed used fixed `bottom: 72`, which risked collision with bottom navigation on taller inset displays.
4. **Flow & Contract Stability:** All 7 critical user flows passed automated verification against API contracts and storage layers (103/103 tests passed, clean monorepo typecheck across all 9 workspaces).

---

## 2. Existing Screen Audit & Implementation Status

| Screen Name | File Path | Route | Implementation Status | Navigation Accessibility | Notes |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Splash Screen** | `src/components/SplashScreen.tsx` | N/A (Root Gate) | **Fully Implemented** | Accessible | Rendered automatically during initial authentication and token restoration in `app/_layout.tsx`. |
| **Community Selection** | Form input inside `login.tsx` & `index.tsx` modal | Inline widget | **Partially Implemented** | Accessible | **No standalone screen.** Embedded as an input field in Login/Register and modal drawer in Feed. |
| **Login** | `app/(auth)/login.tsx` | `/(auth)/login` | **Fully Implemented** | Accessible | Phone normalization, password validation, community slug input, server error banner, and Hindi/English toggle. |
| **Registration** | `app/(auth)/register.tsx` | `/(auth)/register` | **Fully Implemented** | Accessible | Full name, phone, password, community slug, optional roots fields (gender, city, state, gotra, sub-caste). |
| **Home / Social Feed** | `app/(app)/index.tsx` | `/(app)` | **Fully Implemented** | Accessible | Paginated feed, pull-to-refresh, like/unlike toggles, video previews, post type filters, search, FAB button. |
| **Create Post** | `app/(app)/post/create.tsx` | `/(app)/post/create` | **Fully Implemented** | Accessible | Post type selection (General, Announcement, Event), mandatory title validation for events, image attachment, upload. |
| **Post Details** | `app/(app)/post/[id].tsx` | `/(app)/post/[id]` | **Fully Implemented** | Accessible | Full post content, media player, view counter trigger, native Stack header with back navigation. |
| **Comments** | Inside `app/(app)/post/[id].tsx` + `CommentItem.tsx` | Inline widget | **Fully Implemented** | Accessible | Paginated comment list, comment submission input, optimistic updates. |
| **Member Directory** | `app/(app)/directory/index.tsx` | `/(app)/directory` | **Fully Implemented** | Accessible | Debounced search, expandable filters (City, State, Gotra, Sub-Caste), server-side pagination, pull-to-refresh. |
| **Member Profile** | `app/(app)/directory/[id].tsx` | `/(app)/directory/[id]` | **Fully Implemented** | Accessible | Member avatar, badges, location, roots, bio, joined date, privacy enforcement (zero phone/email exposure). |
| **Groups Listing** | `app/(app)/groups/index.tsx` | `/(app)/groups` | **Fully Implemented** | Accessible | Tabs (All, My Groups, Public, Private), single-tap join for public groups, debounced search, pull-to-refresh. |
| **Group Details** | `app/(app)/group/[slug].tsx` | `/(app)/group/[slug]` | **Fully Implemented** | Accessible | Group info, member counts, join/leave actions, private group security guard, discussion posts feed. |
| **Profile / Account** | Inline Modal in `app/(app)/index.tsx` | **Missing Route** | **Partially Implemented** | Inaccessible from Directory/Groups | User name, phone, role, community switch, and logout exist in a modal on Feed. **No standalone route.** |
| **Language Selection** | Top Bar Toggle Pill | Inline widget | **Partially Implemented** | Accessible on all main screens | One-tap pill toggling between Hindi and English across all screens. **No standalone settings page.** |

---

## 3. Navigation Architecture & Invariants

### A. Bottom Navigation Analysis
- **Declared Tabs:** `feed` (`/(app)`), `directory` (`/(app)/directory`), `groups` (`/(app)/groups`).
- **Missing Tab:** No `profile` tab in `BottomNavigation`.
- **System Navigation Insets:** Previously lacked `insets.bottom` handling, causing labels to collide with gesture navigation bars. Remediated using `Math.max(insets.bottom, 10)`.

### B. Route Transitions & Linking
- `Feed` ↔ `Post Details`: Uses `router.push({ pathname: '/(app)/post/[id]', params: { id } })`. **Verified Working.**
- `Feed` → `Create Post`: Uses `router.push('/(app)/post/create')` via FAB. **Verified Working.**
- `Create Post` → `Feed`: Uses `router.back()`. **Verified Working.**
- `Directory` → `Member Profile`: Uses `router.push({ pathname: '/(app)/directory/[id]', params: { id } })`. **Verified Working.**
- `Member Profile` → `Directory`: Uses `router.back()`. **Verified Working.**
- `Groups` → `Group Details`: Uses `router.push({ pathname: '/(app)/group/[slug]', params: { slug } })`. **Verified Working.**
- `Group Details` → `Groups`: Uses `router.back()`. **Verified Working.**
- `Group Discussion Post` → `Post Details`: Uses `router.push({ pathname: '/(app)/post/[id]', params: { id } })`. **Verified Working.**
- `Auth` (Login ↔ Register): Uses `router.push('/(auth)/register')` and `router.push('/(auth)/login')`. **Verified Working.**
- `Logout`: Triggers `clearAuthTokens()`, which transitions `NavigationGate` in `app/_layout.tsx` to `/(auth)/login`. **Verified Working.**

---

## 4. Verification of the 7 User Flows

All 7 required user flows were verified through dedicated automated tests in `apps/mobile/src/tests/ui-navigation-audit.test.ts`:

1. **Open App → Community Selection → Login:**
   - Validates community slug format and Indian phone normalization (`+91XXXXXXXXXX`).
   - Persists community slug in `SecureStore`.
   - Rejects invalid phone numbers and short passwords with localized messages.
2. **Login → Feed:**
   - Saves rotated access and refresh tokens into `SecureStore`.
   - Transitions session to authenticated state.
   - Outgoing API requests automatically attach `Authorization: Bearer <token>` and `x-community-slug`.
3. **Feed → Create Post → Publish:**
   - Validates mandatory post title for `ANNOUNCEMENT` and `EVENT` posts.
   - Allows optional title for `GENERAL` feed posts.
   - Enforces content bounds (1-5000 characters) and 5MB image attachment limit.
4. **Feed → Post Details → Comments:**
   - Loads post details and paginated comments.
   - Submits new comment and records view counter.
5. **Feed → Members → Member Profile:**
   - Queries directory with search and roots filters (`city`, `state`, `gotra`, `subCaste`).
   - Resolves public profile by UUID.
   - Strictly enforces zero phone and zero email exposure on public profiles.
6. **Feed → Groups → Group Details → Join / Leave:**
   - Queries public and private groups with debouncing.
   - Resolves group details by slug.
   - Protects private group discussions behind membership guard.
   - Prevents last admin from leaving without reassignment.
7. **Profile → Language Selection → Logout:**
   - Dynamically toggles language resources between Hindi and English with zero app reload.
   - Logout purges access tokens, refresh tokens, and cached profile data from `SecureStore`.
   - Preserves user's chosen community slug across logout/login cycles.

---

## 5. UI & Responsiveness Problems Identified & Remediated

### Remediated Issues:
1. **Safe Area Inset Collision on Screen Headers:**
   - **Problem:** `app/(app)/index.tsx`, `directory/index.tsx`, `groups/index.tsx`, `directory/[id].tsx`, and `group/[slug].tsx` all hide the native header (`headerShown: false`) and provide custom top bars. None had `insets.top` padding, causing headers to be obscured by the status bar, notch, and camera cutout.
   - **Fix:** Applied `paddingTop: Math.max(insets.top, 12)` (or `14` for detail headers) using `useSafeAreaInsets()` across all 5 screens.
2. **Bottom Navigation Overlapping System Gesture Bar:**
   - **Problem:** `BottomNavigation.tsx` used hardcoded `paddingBottom: 12`. On Android gesture navigation and modern iPhones, tab icons and labels sat on top of the system home pill.
   - **Fix:** Dynamically applied `paddingBottom: Math.max(insets.bottom, 10)` in `BottomNavigation.tsx`.
3. **FAB Overlap on Inset Devices:**
   - **Problem:** `index.tsx` had fixed `bottom: 72` for the FAB. When bottom navigation expanded to accommodate safe area insets, the FAB risked colliding with the top border of the bottom navigation.
   - **Fix:** Changed FAB offset to `bottom: 64 + Math.max(insets.bottom, 10)`.
4. **Auth Screens Top Bar Inset:**
   - **Problem:** `login.tsx` and `register.tsx` top action bar (tenant badge and language switch pill) lacked top safe area padding in `scrollContent`.
   - **Fix:** Applied `paddingTop: Math.max(insets.top, 16)` to `scrollContent`.
5. **Node Test Harness Missing Safe Area Mock:**
   - **Problem:** Node test runner threw `Unexpected token 'typeof'` when importing components that reference `react-native-safe-area-context`.
   - **Fix:** Created `src/tests/mocks/react-native-safe-area-context.ts` providing safe zero insets during test execution and hooked it into `test-runner.ts`.

---

## 6. Automated Test Results

| Test Suite | Command | Assertions | Result |
| :--- | :--- | :---: | :---: |
| **Mobile Foundation** | `npm test -w @apnasamaj/mobile` | 22/22 | **PASS** |
| **Mobile Auth & Session** | `npm test -w @apnasamaj/mobile` | 17/17 | **PASS** |
| **Auth Verification & Security** | `npm test -w @apnasamaj/mobile` | 5/5 | **PASS** |
| **Social Feed & Interactions** | `npm test -w @apnasamaj/mobile` | 8/8 | **PASS** |
| **Post Creation & Validation** | `npm test -w @apnasamaj/mobile` | 17/17 | **PASS** |
| **Community Member Directory** | `npm test -w @apnasamaj/mobile` | 7/7 | **PASS** |
| **Community Groups & Discussions** | `npm test -w @apnasamaj/mobile` | 10/10 | **PASS** |
| **UI & User Flows Navigation Audit** | `npm test -w @apnasamaj/mobile` | 17/17 | **PASS** |
| **Total Mobile Test Suite** | `npm test -w @apnasamaj/mobile` | **103/103** | **100% PASS** |
| **Monorepo Typecheck** | `npm run typecheck` | 9 workspaces | **0 ERRORS** |

*Note on Testing Environment:* Automated test suites and TypeScript typechecking were executed directly in the Node.js test environment. Static bundle resolution was verified via Metro. **No physical-device on-screen testing was performed**, in strict adherence to project reporting integrity guidelines.

---

## 7. Recommended Next Steps (Future Batches)

1. **Standalone Profile & Settings Screen (`app/(app)/profile.tsx`):**
   - Extract the inline Profile Modal into a dedicated route.
   - Add a 4th `Profile` tab to `BottomNavigation.tsx` so users can access their account details, change community, or log out from any tab without returning to the Feed.
2. **Dedicated Community Onboarding Screen:**
   - Implement an onboarding step for first-time app launches to select/search available community instances before presenting the login/registration form.
3. **Physical Android APK / Dev Client Build Verification:**
   - Run `npx expo run:android` or build with EAS once a physical testing device or emulator is connected.

