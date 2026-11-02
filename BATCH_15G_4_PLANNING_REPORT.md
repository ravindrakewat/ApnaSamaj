# Apna Samaj — Batch 15G.4 Planning Audit Report
## Monorepo State Assessment & Next Batch Recommendation

**Date:** 2026-11-02  
**Audit Mode:** STRICT READ-ONLY PLANNING AUDIT  
**Current Branch:** `main`  
**Current HEAD:** `247fb6d7ad4fe5bca836ef4997ec7d7c58e14313` (`247fb6d`)  
**Previous Checkpoint:** `3d36b06db99e698fdac9ee566d1e97d1ff14e470` (`3d36b06`)  
**Working Tree Status:** 100% Clean (0 unstaged, 0 staged)

---

## 1. Executive Summary

Following the successful implementation, stabilization, and local checkpoint commits for:
1. **Commit `3d36b06`:** Admin Member Excel Import Fix (Batch 15F Fix)
2. **Commit `247fb6d`:** Social Feed Localization & Direct Video Upload (Batch 15G.1 + 15G.2 + 15G.3)

This planning audit evaluates the current Apna Samaj monorepo across all apps (`web`, `admin`, `api`) and shared packages (`database`, `shared-types`, `validation`, `i18n`) to identify the single highest-leverage, lowest-risk next development batch.

### Primary Recommendation:
**Batch 15H.1 — Member Directory & Profile Localization (Hindi / English)**  
Extending the platform's shared multilingual infrastructure (`@apnasamaj/i18n`) to the Member Directory (`DirectoryPage.tsx`) and Member Profile (`MemberProfilePage.tsx`). This aligns the directory experience with Apna Samaj's core Hindi-first identity, replacing hardcoded English strings with natural Devanagari Hindi terminology for cultural lineage attributes (गोत्र, उप-जाति, मूल निवास, शहर, राज्य, सत्यापित सदस्य) while maintaining dual-language parity with English.

---

## 2. Monorepo State & Feature Inventory

| Module / Area | Location | Current State | Verification Status | Gaps / Remaining Work |
|:---|:---|:---|:---:|:---|
| **Shared i18n Foundation** | `packages/i18n` | Namespaces: `common`, `nav`, `auth`, `notifications`, `feed`. Dual `hi` and `en` resources with 1:1 key parity. | **Verified Pass** (26 unit tests) | Missing namespaces for `directory`, `groups`, `matrimonial`. |
| **Social Feed** | `apps/web/src/pages/FeedPage.tsx`, `CreatePostComposer.tsx`, `PostCard.tsx` | Fully localized in Hindi & English. Authenticated direct video uploads (MP4/WebM, 30MB/90s), YouTube embeds, photo uploads, HTML5 player. | **Verified Pass** (105 automated tests) | Needs live staging verification with real Supabase bucket on push. |
| **Admin Member Import** | `apps/admin/src/pages/MemberManagementPage.tsx`, `BulkImportDialog.tsx` | 3-step import wizard mounted in JSX, formula injection sanitization, dry-run preview, atomic Argon2id provisioning. | **Verified Pass** (53 UX + 57 backend + 75 contracts tests) | Fully stabilized in commit `3d36b06`. |
| **Member Self-Claiming** | `apps/web/src/pages/ClaimAccountPage.tsx` | Phone-based claiming with SMS OTP, cooldown, and password initialization. | **Verified Pass** (72 tests) | Imports `useTranslation` from `react-i18next` rather than `@apnasamaj/i18n`. |
| **Member Directory** | `apps/web/src/pages/DirectoryPage.tsx`, `MemberProfilePage.tsx` | Search, 4-tier filtering (city, state, gotra, sub-caste), 400ms debouncing, URL sync, bounded pagination (limit 12, API max 50). | **Verified Pass** (28 backend + 29 frontend tests) | **100% hardcoded English UI strings**. Jarring disconnect when toggling Navbar to Hindi. |
| **Community Groups** | `apps/web/src/pages/GroupsPage.tsx`, `GroupDetailPage.tsx` | Group lifecycle, privacy modes (`PUBLIC`, `PRIVATE`, `SECRET`), membership management, tabbed feeds. | **Verified Pass** (45 tests) | **100% hardcoded English UI strings**. |
| **Matrimonial Module** | `apps/web/src/pages/MatrimonialDiscoveryPage.tsx`, `MatrimonialDashboardPage.tsx` | Multi-criteria matchmaking, photo gallery with fallback, privacy preferences, interest requests. | **Verified Pass** (87 tests) | Hardcoded English; large scope. |
| **Notifications** | `apps/web/src/components/NotificationBell.tsx` | Localized notification bell, relative timestamps, tabs, unread counts, Socket.IO room joins. | **Verified Pass** (31 unit tests) | Fully functional. |

---

## 3. Evaluation of Candidate Next Batches

We analyzed 4 prospective next batches against four core criteria:
1. **User Value:** Impact on end-user experience and community trust.
2. **Architectural Coherence:** Continuity with previous batches (15E.3B, 15E.3C, 15G.1).
3. **Blast Radius & Risk:** Potential to destabilize existing working code or require risky migrations.
4. **Execution Independence:** Ability to complete cleanly without blocking on external infrastructure.

### Candidate A: Member Directory & Profile Localization (Batch 15H.1) — **RECOMMENDED**
- **Pros:**
  - Apna Samaj is explicitly a Hindi-first community platform.
  - Member Directory is the primary discovery tool for community members (searching relatives, mandals, gotras, sub-castes).
  - When a user selects Hindi (`हिन्दी`), the Navbar navigation says "सदस्य निर्देशिका", but clicking it reveals an entirely English screen ("Community Member Directory", "Filter by city", "Filter by gotra", "Verified Member").
  - Scope is well-bounded: 2 pages (`DirectoryPage.tsx`, `MemberProfilePage.tsx`) and 1 shared namespace (`directory`).
  - Zero backend changes or database migrations required; the backend directory APIs (`GET /api/v1/users`, `GET /api/v1/users/:id`) already adhere to multi-tenant safety.
- **Cons:** None. Low complexity, high impact.

### Candidate B: Community Groups Localization (Batch 15H.2)
- **Pros:** High value for group interactions.
- **Cons:** Broader surface area (group chat, member rosters, join request dialogs, privacy settings, feed tab). Best approached after Member Directory is standardized.

### Candidate C: Background Video Transcoding Pipeline
- **Pros:** Ensures legacy browser compatibility for HEVC/ProRes videos.
- **Cons:** Requires external cloud transcoding service setup (e.g. Cloudflare Stream, Mux, or Supabase Edge Functions with FFmpeg) and credential configuration. Blocks on external infrastructure.

### Candidate D: Matrimonial Discovery & Dashboard Localization
- **Pros:** Core platform feature for matrimonial matches.
- **Cons:** Spans 3 complex pages (>1,500 lines of frontend code). Better executed after Directory and Groups foundations are localized.

---

## 4. Focused Scope: Batch 15H.1 — Member Directory & Profile Localization (Hindi / English)

### A. Problem Statement
The Member Directory (`DirectoryPage.tsx`) and Member Profile View (`MemberProfilePage.tsx`) currently contain 100% hardcoded English UI strings. When users toggle the application language between Hindi and English via the Navbar `LanguageSelector`, the directory remains static English. Core Indian community lineage concepts—**Gotra (गोत्र)**, **Sub-Caste (उप-जाति)**, **Native Place (मूल निवास / पैतृक गाँव)**, **City (शहर / नगर)**, **State (राज्य)**, and **Verified Member (सत्यापित सदस्य)**—lack authentic Hindi terminology, disrupting the platform's linguistic immersion.

### B. Features Included in Batch 15H.1
1. **Shared i18n Registration:**
   - Register `'directory'` in `TRANSLATION_NAMESPACES` in `packages/i18n/src/constants.ts`.
   - Export `DirectoryTranslationKey` in `packages/i18n/src/types.ts`.
   - Register `directoryHi` and `directoryEn` in `packages/i18n/src/resources.ts`.
2. **Dual-Language Translation Resources:**
   - Create `packages/i18n/src/locales/hi/directory.json` with natural, respectful Devanagari Hindi terminology.
   - Create `packages/i18n/src/locales/en/directory.json` with clear English translations.
   - Enforce 100% key parity between `hi` and `en`.
3. **Localize `DirectoryPage.tsx`:**
   - Hero banner title and subtitle.
   - Verified member badge count with singular/plural formatting ("45 सत्यापित सदस्य").
   - Search input placeholder, labels, and clear button ARIA labels.
   - 4 filter inputs (City, State, Sub-caste, Gotra) with localized placeholders, start icons, and clear buttons.
   - Reset filters action button.
   - Dynamic empty states: differentiating general empty directory from zero search results with parameter interpolation.
   - Member card chips and badges ("Verified Member", "Member since [Date]").
   - Localized join date formatting using active language locale (`hi-IN` vs `en-IN`).
   - Loading skeletons and error alerts with retry action.
   - Pagination text ("Showing X of Y members").
4. **Localize `MemberProfilePage.tsx`:**
   - Navigation Back button and breadcrumbs.
   - Loading spinner and error alert messages.
   - Unavailable profile empty state ("Member Profile Unavailable", "Back to Directory", "Retry").
   - Profile section headings (Personal Information, Community Lineage, Contact Details).
   - Attribute labels: Full Name, Gender, City, State, Native Place, Gotra, Sub-Caste, Profession, Education.
   - Role chips (Member, Moderator, Admin) and Status chips (Active, Verified).
   - Localized member since date formatting.
5. **Comprehensive Automated Test Suite:**
   - Create `apps/web/src/tests/directory-localization-ux.test.ts` testing 1:1 key parity, dynamic language switching without page reload, singular/plural member count formatting, filter label interpolation, and untranslated user data.

### C. Explicit Exclusions
- **Zero User Content Translation:** Member full names, custom biographical text, and stored database strings remain untranslated to preserve identity integrity.
- **Zero Database Migrations:** No changes to Prisma schema or PostgreSQL database tables.
- **Zero Backend Changes:** No alterations to API routes, controllers, or database queries.
- **No Scope Creep:** Excludes Groups, Matrimonial, Admin panel, or Auth pages.

---

## 5. Architectural & Security Considerations

### A. Multi-Tenant Architectural Invariants
- Directory endpoints (`GET /api/v1/users` and `GET /api/v1/users/:id`) strictly execute via `req.db` and enforce `requireTenantContext` and `requireActiveUser`.
- Sensitive fields (password hashes, tokens, personal emails, unverified phone numbers) remain omitted from public member directory projections.

### B. Frontend Files Likely to Change
| File | Action | Purpose |
|:---|:---:|:---|
| `packages/i18n/src/constants.ts` | Modify | Add `'directory'` to `TRANSLATION_NAMESPACES`. |
| `packages/i18n/src/resources.ts` | Modify | Register `directoryHi` and `directoryEn`. |
| `packages/i18n/src/types.ts` | Modify | Export `DirectoryTranslationKey` and update schema. |
| `packages/i18n/src/locales/hi/directory.json` | Create | Hindi translation resource for Directory. |
| `packages/i18n/src/locales/en/directory.json` | Create | English translation resource for Directory. |
| `apps/web/src/pages/DirectoryPage.tsx` | Modify | Localize directory header, search, 4 filters, member cards, empty states, and pagination. |
| `apps/web/src/pages/MemberProfilePage.tsx` | Modify | Localize back button, profile details, lineage chips, and unavailable states. |
| `apps/web/src/tests/directory-localization-ux.test.ts` | Create | Automated unit & UX test suite for directory localization. |

---

## 6. Verification & Acceptance Criteria

### A. Acceptance Criteria
1. When active language is `hi`, visiting `/directory` displays all chrome, headers, placeholders, filter labels, and empty states in Devanagari Hindi.
2. When active language is `en`, visiting `/directory` displays all chrome in English.
3. Switching languages via the Navbar `LanguageSelector` updates the Directory UI immediately without page reload.
4. Member full names, city names, gotra values, and IDs remain untranslated.
5. `npm run typecheck` passes with 0 errors across all 8 monorepo workspaces.
6. `npm run build --workspace=@apnasamaj/web` succeeds with 0 errors.
7. All existing 290 automated test assertions continue to pass without regression.

### B. Manual Browser Verification Script (Post-Implementation)
1. Log in to the web portal as an active member (`/login`).
2. Open `/directory` with language set to Hindi.
3. Verify banner: "समाज सदस्य निर्देशिका", chip: "सत्यापित सदस्य".
4. Verify filter placeholders: "नाम, गोत्र, शहर या उप-जाति से खोजें...", "शहर से फ़िल्टर करें...", "राज्य से फ़िल्टर करें...", "उप-जाति से फ़िल्टर करें...", "गोत्र से फ़िल्टर करें...".
5. Enter a non-existent search query (e.g. `xyznonexistent`) and verify localized empty search state.
6. Click on a member card to view `/members/:id` (`MemberProfilePage.tsx`) and verify localized attribute labels (गोत्र, उप-जाति, मूल निवास).
7. Switch language to English via the Navbar selector and verify instant update without page reload.

---

## 7. Conclusion & Next Steps

The repository is in a completely stable, clean state with `3d36b06` and `247fb6d` locally committed.

**Awaiting user review and explicit approval before starting Batch 15H.1 implementation.**

