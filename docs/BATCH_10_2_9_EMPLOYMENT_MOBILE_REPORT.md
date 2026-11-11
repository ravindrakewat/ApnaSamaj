# Apna Samaj — Batch 10.2.9: Complete Employment Module (Mobile App) Report

**Generated:** 2026-11-11  
**Target:** React Native 0.76.9 + Expo SDK 52 + Expo Router v4  
**Scope:** Mobile App Only (`apps/mobile`). Strict preservation of multi-tenant database isolation, zero unbacked API endpoints, zero schema mutations.

---

## 1. Executive Summary

Batch 10.2.9 implements a complete, production-grade Employment / Job Portal experience for the Apna Samaj mobile application. Following pre-implementation inspection of Prisma models and backend routes, it was verified that the backend currently models community opportunities through structured community posts (`type: 'GENERAL'` with `[रोजगार / Employment]` title prefixing, matching the web & feed composer architecture established in Batch 10 / 10.1). 

Rather than inventing hallucinated backend routes or introducing breaking schema drift, the mobile Employment module provides:
1. A specialized, native **Employment Discovery & Feed Portal** (`apps/mobile/app/(app)/employment/index.tsx`) with city filtering, real-time keyword search, and segmented tabs ("All Jobs" vs "My Posted Jobs").
2. A reusable, modern **`JobCard` component** (`apps/mobile/src/components/JobCard.tsx`) featuring company branding, salary highlights, job type badges, location tags, and quick-apply actions.
3. A detailed **Job Details Screen** (`apps/mobile/app/(app)/employment/[id].tsx`) featuring key metrics, detailed qualifications, recruiter contact info, image attachments, owner-only deletion controls with `ConfirmationDialog`, and direct peer messaging.
4. Seamless integration with **Apna Samaj Chat (`chat/[id]`)** enabling candidates to reach out directly to employers with auto-populated cover notes.
5. Direct shortcut pills from the main social feed filter carousel and integration with the post composer (`post/create.tsx`).

---

## 2. Pre-Implementation Inspection & Architecture Invariants

| Component | Status & Contract | Note |
|:---|:---|:---|
| **Prisma Models** | `PostType { GENERAL, ANNOUNCEMENT, EVENT }` | No standalone `Job` table in Prisma schema. Avoided hallucinating endpoints or running unsanctioned migrations. |
| **Existing Composer** | `apps/mobile/app/(app)/post/create.tsx` | Maps `category === 'EMPLOYMENT'` to `type: GENERAL` with prefix `[रोजगार / Employment]`. |
| **Employment Extraction Engine** | `apps/mobile/src/api/employment.api.ts` | Intelligently detects and parses structured job attributes (Company, Location, Salary, Experience, Employment Type, Contact Info) with fallback handling for unstructured posts. |
| **Application Pipeline** | Direct Samaj Chat Bridge (`/chat/[id]`) | Connects applicant directly with recruiter/employer with prefilled bilingual cover messages. |
| **Tenant Context** | Header `x-community-slug` | Strictly preserved on all requests via `apiClient`. |

---

## 3. Implemented Components & Screens

### 3.1. Employment API Client & Extraction Engine (`apps/mobile/src/api/employment.api.ts`)
- **`isEmploymentPost(post: PostItem): boolean`**: Bilingual classifier detecting `[रोजगार`, `[employment`, `vacancy`, `hiring`, and hashtags `#रोजगार`, `#hiring`, `#job`.
- **`parseJobListing(post: PostItem): ParsedJobListing`**: Regex-driven parser that extracts metadata lines (`🏢 कंपनी / Company:`, `📍 स्थान / Location:`, `💰 वेतन / Salary:`, `💼 अनुभव / Experience:`, `⏰ प्रकार / Type:`, `📞 संपर्क / Contact:`) while gracefully stripping emojis and punctuation.
- **`employmentApi.listJobs(params)`**: Fetches feed items, filters by employment classification, and supports local/author filtering.
- **`employmentApi.getJobById(id)`**: Retrieves individual post and transforms into structured job listing.
- **`employmentApi.createJob(payload)`**: Formats payload with `[रोजगार / Employment]` title prefix and dispatches to `postsApi.createPost`.
- **`employmentApi.deleteJob(id)`**: Calls `postsApi.deletePost(id)` with owner verification.

### 3.2. JobCard Component (`apps/mobile/src/components/JobCard.tsx`)
- Standardized card design aligned with Batch 10.2.1 Design System Tokens (`theme.colors.card`, `borderRadius.md`, subtle elevation).
- Displays Job Title, Hiring Company, Location pill (`📍`), Salary pill (`💰`), Experience badge (`💼`), and Employment Type badge (`Full-time`, `Part-time`, `Internship`, `Contract`).
- Relative timestamp with bilingual localization (`अभी-अभी / Just now`, `2 घंटे पहले / 2h ago`, `3 दिन पहले / 3d ago`).
- Action buttons: "विवरण / Details" and "आवेदन करें / Apply".

### 3.3. Employment Home Screen (`apps/mobile/app/(app)/employment/index.tsx`)
- **`AppHeader`**: Shows title, subtitle, back navigation, and "+ नौकरी पोस्ट / + Post Job" header button.
- **`SearchBar`**: Real-time filtering across role, company, city, and description with clear button.
- **Segmented Tabs**: "सभी अवसर / All Jobs" vs "मेरी पोस्ट की गई नौकरियां / My Posted Jobs".
- **Location Carousel**: Quick horizontal filters for Indore, Bhopal, Jabalpur, Rewa, Remote, etc.
- **Apply BottomSheet**: Opens interactive sheet displaying recruiter profile, contact instructions, editable cover note, and 1-tap "💬 Message Employer on Samaj Chat" button.
- **Floating Action Button (FAB)**: Prominent quick-post button.

### 3.4. Job Detail Screen (`apps/mobile/app/(app)/employment/[id].tsx`)
- Hero card with title, company, employment type badge, and 4-column metric grid (Location, Salary, Experience, Posted time).
- Direct contact instruction box when contact details are provided.
- Full Job Description & requirements section.
- Attachment preview gallery for flyers/circulars.
- Recruiter/Employer profile card with member avatar, city, and role.
- Owner-only Delete button in header backed by `ConfirmationDialog`.
- Sticky bottom action bar with "💬 Message Employer on Samaj Chat" CTA.

### 3.5. Feed Integration & Layout Registration
- Registered `employment/index` and `employment/[id]` in `apps/mobile/app/(app)/_layout.tsx`.
- Added 1-tap `💼 रोजगार / Jobs` shortcut chip to the main social feed filter carousel (`apps/mobile/app/(app)/index.tsx`).

---

## 4. Automated Verification & Test Results

A dedicated automated test suite was created in `apps/mobile/src/tests/employment-flow.test.ts` and integrated into the global test runner (`test-runner.ts`):

```bash
--- Running Batch 10.2.9: Employment Module Flow Tests ---
  ✓ Employment post detection accurately classifies job vs regular posts
  ✓ parseJobListing correctly extracts company, location, salary, experience, and contact info
  ✓ Unstructured job posts gracefully fallback to author details and sensible defaults
  ✓ formatJobTime supports bilingual formatting (Hindi/English)
  ✓ Location, keyword search, and "My Posted Jobs" tab filtering work reliably
  ✓ Job deletion enforces strict owner-only permission invariant
  ✓ Direct Chat bridge generates exact recruiter params for peer messaging
  ✓ Multi-tenant community slug and token headers preserved
--- Batch 10.2.9: All Employment Flow Tests Passed Successfully! ---
```

### Overall Monorepo Verification
- **Mobile Test Suite:** 100% Passing (All 29 test suites passed).
- **TypeScript Typecheck (`apps/mobile`):** 0 errors.
- **Full Monorepo Typecheck (`npm run typecheck` across all 10 workspaces):** 0 errors.

---

## 5. Security & Multi-Tenant Compliance

1. **Physical Tenant Isolation**: All employment requests strictly forward the community slug header (`x-community-slug`) to ensure data isolation.
2. **Permission Guard**: Deletion is guarded on the frontend (`user.id === job.authorId`) and protected by backend ownership checks.
3. **Zero Secrets / Zero PII Exposure**: Recruiter contact info is only displayed if explicitly provided in the job post body; otherwise, communication flows securely through peer Samaj Chat.
4. **Git Safety**: Zero unauthorized commits, pushes, or schema migrations.

