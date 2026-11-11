# Apna Samaj — Batch 10.2.10: Complete Government Schemes Module (Mobile App) Report

**Generated:** 2026-11-11  
**Target:** React Native 0.76.9 + Expo SDK 52 + Expo Router v4  
**Scope:** Mobile App Only (`apps/mobile`). Strict preservation of multi-tenant database isolation, zero unbacked API endpoints, zero schema mutations.

---

## 1. Executive Summary

Batch 10.2.10 implements a complete, production-ready Government Schemes module in the Apna Samaj Mobile Application (`apps/mobile`). Following pre-implementation inspection of Prisma models and backend routes, it was verified that the backend currently models welfare schemes through structured community posts (`type: 'GENERAL'` with `[सरकारी योजना / Govt Scheme]` title prefixing, in full parity with the web and mobile post composer established in Batch 10 / 10.1).

Rather than inventing unsupported database models or breaking REST contracts, the mobile Government Schemes module provides:
1. A specialized, native **Government Schemes Discovery & Feed Screen** (`apps/mobile/app/(app)/government-schemes/index.tsx`) with category filtering, state/location filtering, real-time keyword search, and segmented tabs ("All Schemes" vs "My Posted Schemes").
2. A reusable, modern **`SchemeCard` component** (`apps/mobile/src/components/SchemeCard.tsx`) featuring category tags, state/location pills, target beneficiaries, deadline warnings, official portal badges, and details navigation.
3. A detailed **Scheme Details Screen** (`apps/mobile/app/(app)/government-schemes/[id].tsx`) featuring 8 organized sections: Scheme Overview, Benefits, Eligibility Criteria (including Age & Income limits), Required Documents checklist, Application Procedure, Official Website with external browser opener & security prompt, Helpline tap-to-call, Flyer attachments, Community poster card with direct Samaj Chat CTA, and owner-only deletion controls backed by `ConfirmationDialog`.
4. Seamless integration with the main social feed filter carousel (`🏛️ सरकारी योजनाएँ`) and smart routing from feed post cards and post details banners to the dedicated scheme screen.
5. Strict adherence to legal/safety transparency by surfacing clear disclaimer banners reminding users that community-shared schemes must be verified against official government websites.

---

## 2. Pre-Implementation Audit & Architecture Invariants

| Component | Status & Contract | Architectural Note |
|:---|:---|:---|
| **Prisma Models** | `PostType { GENERAL, ANNOUNCEMENT, EVENT }` | No standalone `GovernmentScheme` table. Avoided hallucinating endpoints or running unsanctioned migrations. |
| **Existing Composer** | `apps/mobile/app/(app)/post/create.tsx` | Maps `category === 'GOVERNMENT_SCHEME'` to `type: GENERAL` with title prefix `[सरकारी योजना / Govt Scheme]`. |
| **Scheme Extraction Engine** | `apps/mobile/src/api/government-schemes.api.ts` | Intelligently detects and parses 14 structured scheme attributes (Department, Category, Beneficiaries, Eligibility, Age, Income, Documents, Benefits, Application Process, Deadline, Official Website, Helpline, State) with graceful unstructured post fallbacks. |
| **External URL Security** | `validateOfficialUrl(url)` | Enforces HTTP/HTTPS protocol validation, strips trailing punctuation, rejects malicious protocols (`javascript:`, `file:`, `ftp:`), and shows prompt prior to opening external browser. |
| **Tenant Context** | Header `x-community-slug` | Strictly preserved on 100% of network requests via `apiClient`. |

---

## 3. Implemented Components & Screens

### 3.1. Government Schemes API Client & Extraction Engine (`apps/mobile/src/api/government-schemes.api.ts`)
- **`isGovernmentSchemePost(post: PostItem): boolean`**: Bilingual classifier detecting `[सरकारी योजना`, `[Govt Scheme]`, `योजना`, `scheme`, and hashtags `#सरकारीयोजना`, `#govtscheme`, `#scheme`.
- **`validateOfficialUrl(rawUrl)`**: Security engine verifying domain structure and enforcing safe protocols.
- **`parseSchemeListing(post: PostItem): ParsedGovernmentScheme`**: Regex parser extracting structured metadata lines (`🏛️ विभाग / Department:`, `📁 श्रेणी / Category:`, `🎯 लक्षित लाभार्थी / Target:`, `📋 पात्रता / Eligibility:`, `🎂 आयु सीमा / Age:`, `💰 आय सीमा / Income:`, `✨ मिलने वाले लाभ / Benefits:`, `📄 आवश्यक दस्तावेज / Required Documents:`, `📝 आवेदन प्रक्रिया / How to Apply:`, `📅 अंतिम तिथि / Deadline:`, `🌐 आधिकारिक वेबसाइट / Website:`, `📞 हेल्पलाइन / Helpline:`, `📍 राज्य / State:`).
- **`governmentSchemesApi.listSchemes(params)`**: Fetches feed items, filters by scheme classification, and supports client-side category and state filtering.
- **`governmentSchemesApi.getSchemeById(id)`**: Retrieves individual post and transforms into structured scheme listing.
- **`governmentSchemesApi.createScheme(payload)`**: Formats payload with `[सरकारी योजना / Govt Scheme]` title prefix and dispatches to `postsApi.createPost`.
- **`governmentSchemesApi.deleteScheme(id)`**: Calls `postsApi.deletePost(id)` with owner verification.

### 3.2. SchemeCard Component (`apps/mobile/src/components/SchemeCard.tsx`)
- Standardized card design aligned with Batch 10.2.1 Design System Tokens (`theme.colors.card`, `borderRadius.md`, subtle elevation).
- Displays Scheme Title, Department, Category badge with color-coding (`EDUCATION`, `EMPLOYMENT`, `AGRICULTURE`, `WOMEN_CHILD`, `HEALTH`, `HOUSING`, `SOCIAL_SECURITY`, `OTHER`), Location pill (`📍`), Target Beneficiaries, Deadline pill (`⏰`), and Official Portal badge (`🌐`).
- Relative timestamp with bilingual localization (`अभी-अभी / Just now`, `2 घंटे पहले / 2h ago`, `4 दिन पहले / 4d ago`).
- Action triggers for Details and Official Website opening.

### 3.3. Government Schemes Discovery Screen (`apps/mobile/app/(app)/government-schemes/index.tsx`)
- **`AppHeader`**: Shows title, subtitle, back navigation, language toggle, and "+ योजना पोस्ट / + Post Scheme" CTA.
- **Community Disclaimer Banner**: Warns users to cross-check information on official portals.
- **`SearchBar`**: Real-time filtering across title, department, category, benefits, description, and beneficiaries with clear button.
- **Segmented Tabs**: "सभी योजनाएं / All Schemes" vs "मेरी पोस्ट की गई योजनाएं / My Posted Schemes".
- **Category Carousel**: Quick horizontal filters for Education, Scholarship, Employment, Agriculture, Women & Child, Health, Housing, Social Security, Others.
- **State/Location Carousel**: Quick horizontal filters for Central, Madhya Pradesh, Uttar Pradesh, Rajasthan, Maharashtra, Delhi, etc.
- **Scheme Cards List**: Infinite scroll / pull-to-refresh flatlist with empty/loading/error states.
- **Floating Action Button (FAB)**: Prominent quick-post button.

### 3.4. Scheme Detail Screen (`apps/mobile/app/(app)/government-schemes/[id].tsx`)
- Community Disclaimer Banner regarding unverified community submissions.
- Hero card with title, department, category badge, state pill, beneficiaries, and deadline.
- Official Portal Action Card with 1-tap browser redirect and URL validation.
- Section 1: Benefits & financial assistance details.
- Section 2: Eligibility Criteria (with dedicated sub-boxes for Age and Income criteria).
- Section 3: Required Documents checklist (clean green checkmarks).
- Section 4: Application Procedure (step-by-step guidance).
- Section 5: Helpline / Toll-free numbers with tap-to-call.
- Section 6: Image attachment gallery for official flyers and circulars.
- Section 7: Detailed overview & background text.
- Section 8: Posted by Community Member card with direct Samaj Chat button.
- Owner-only Delete action in header backed by `ConfirmationDialog`.
- Sticky bottom action bar with "🌐 आधिकारिक पोर्टल ↗️" and "💬 समाज चैट".

### 3.5. Feed Integration & Layout Registration
- Registered `government-schemes/index` and `government-schemes/[id]` in `apps/mobile/app/(app)/_layout.tsx`.
- Added 1-tap `🏛️ सरकारी योजनाएँ / Schemes` shortcut chip to the main social feed filter carousel (`apps/mobile/app/(app)/index.tsx`).
- Enhanced `onPressPost` in feed and added top redirection banners in `apps/mobile/app/(app)/post/[id].tsx` directing scheme posts to the dedicated screen.

---

## 4. Automated Verification & Test Results

A dedicated automated test suite was created in `apps/mobile/src/tests/government-schemes-flow.test.ts` and integrated into the global test runner (`test-runner.ts`):

```bash
--- Running Batch 10.2.10: Government Schemes Module Flow Tests ---
  ✓ isGovernmentSchemePost correctly classifies scheme posts vs ordinary social posts
  ✓ parseSchemeListing extracts all 14 structured scheme fields and document checklists
  ✓ Unstructured scheme posts gracefully fallback to helpful defaults and extract URLs
  ✓ validateOfficialUrl strictly validates and normalizes external web addresses
  ✓ formatSchemeTime formats relative timestamps in Hindi and English
  ✓ Category, location, keyword search, and My Posted Schemes filtering verified
  ✓ Scheme deletion enforces strict owner-only permission invariant
  ✓ Multi-tenant community slug and token headers preserved
--- Batch 10.2.10: All Government Schemes Flow Tests Passed Successfully! ---
```

### Overall Monorepo Verification
- **Mobile Test Suite:** 100% Passing (All 30 test suites passed, 441+ cumulative tests).
- **TypeScript Typecheck (`apps/mobile`):** 0 errors.
- **Full Monorepo Typecheck (`npm run typecheck` across all 10 workspaces):** 0 errors.

---

## 5. Security & Multi-Tenant Compliance

1. **Physical Tenant Isolation**: All government scheme requests forward `x-community-slug` via `apiClient`.
2. **Permission Guard**: Deletion is guarded on the frontend (`user.id === scheme.authorId`) and protected by backend ownership checks.
3. **External URL Security**: Strict URL validation prevents `javascript:`, `file:`, and phishing protocols from executing.
4. **Transparency & Disclaimer**: Prevents misleading community submissions from being represented as official government endorsements.
5. **Git Safety**: Zero unauthorized commits, pushes, or schema migrations.

