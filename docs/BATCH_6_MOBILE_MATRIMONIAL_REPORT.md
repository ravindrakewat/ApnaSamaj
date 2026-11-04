# Apna Samaj — Batch 6: Mobile Matrimonial Module Engineering Report

**Date:** November 4, 2026  
**Module:** Mobile Matrimonial Profiles, Discovery & Connection System (`apps/mobile`)  
**Status:** **Verified Pass** (136/136 tests passing: 122 existing + 14 new matrimonial tests, 0 typecheck errors across all 9 workspaces)  
**Author:** Apna Samaj Assistant & Engineering Pair  

---

## 1. Executive Summary

Batch 6 implements the complete native Mobile Matrimonial module in `apps/mobile`, enabling verified community members to discover matrimonial candidates, inspect detailed cultural/educational/family background profiles, and express matrimonial interest with strict multi-tenant privacy and server-side authorization enforcement.

All implementations strictly reuse existing backend endpoints, database models, and validation schemas from `apps/api/src/modules/matrimonial` without creating new backend routes, modifying database migrations, or compromising member privacy.

---

## 2. Existing Backend Inspection & API Mapping

Before writing client code, existing backend routes (`apps/api/src/modules/matrimonial/matrimonial.routes.ts`), controllers (`matrimonial.controller.ts`), services (`matrimonial.service.ts`), and Prisma models (`packages/database/prisma/schema.prisma`) were thoroughly audited:

| Mobile Screen / Action | Backend Route | HTTP Method | Request Contracts & Filters | Backend Security & Processing | Status |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Discovery Listing** | `/api/v1/matrimonial/profiles` | `GET` | Query: `gender`, `minAge`, `maxAge`, `maritalStatus`, `manglik`, `diet`, `subCaste`, `city`, `state`, `page`, `limit` | Scoped to active community database; returns only `APPROVED` profiles; automatically excludes profiles blocked by or blocking current user | **Fully Integrated** |
| **Profile Details** | `/api/v1/matrimonial/profiles/:id` | `GET` | Path: `:id` (UUID) | Authorizes access; excludes private phone/email unless mutual interest is accepted (`unlockedContact`) | **Fully Integrated** |
| **Express Interest** | `/api/v1/matrimonial/interests` | `POST` | Body: `{ receiverId: string, message?: string }` | Validates non-self, non-blocked, and non-duplicate interest submission; creates `PENDING` interest | **Fully Integrated** |
| **List Received Interests** | `/api/v1/matrimonial/interests/received` | `GET` | Query: `page`, `limit` | Returns incoming interest requests with sender candidate summary and status | **Fully Integrated** |
| **List Sent Interests** | `/api/v1/matrimonial/interests/sent` | `GET` | Query: `page`, `limit` | Returns outgoing connection requests initiated by current member | **Fully Integrated** |
| **Respond to Interest** | `/api/v1/matrimonial/interests/:id` | `PATCH` | Path: `:id`, Body: `{ status: 'ACCEPTED' \| 'DECLINED' \| 'WITHDRAWN' }` | Updates interest status; upon `ACCEPTED`, both parties unlock contact phone number | **Fully Integrated** |
| **Report Profile** | `/api/v1/matrimonial/profiles/:id/report` | `POST` | Path: `:id`, Body: `{ reason: string, explanation?: string }` | Records community moderation report with reason code (`FAKE_PROFILE`, `INCORRECT_INFORMATION`, etc.) | **Fully Integrated** |
| **Block Candidate** | `/api/v1/matrimonial/profiles/:id/block` | `POST` | Path: `:id` | Adds candidate to member's blocklist; excludes them from discovery and interactions | **Fully Integrated** |
| **Unblock Candidate** | `/api/v1/matrimonial/profiles/:id/block` | `DELETE` | Path: `:id` | Removes candidate from blocklist | **Fully Integrated** |
| **Own Matrimonial Profile** | `/api/v1/matrimonial/me` | `GET` | None | Returns member's own matrimonial draft/submitted profile or null | **Fully Integrated** |

### Backend Capabilities Documented as Unavailable (Out of Scope):
- **Real-Time Direct Chat Before Mutual Acceptance:** Blocked by platform privacy rules; candidates cannot initiate unmoderated direct messaging without mutual consent.
- **Automated Algorithmic Kundali Milan Scoring:** Astrological fields (`rashi`, `nakshatra`, `birthTime`, `birthCity`, `manglik`) are stored and presented transparently, but the backend does not provide an automated astrological score engine.
- **Commercial Subscriptions:** Apna Samaj matrimonial is community-focused and free; no monetization or paywall endpoints exist in the backend.

---

## 3. Screens & Architecture Implemented

### 1. Matrimonial Discovery Screen (`apps/mobile/app/(app)/matrimonial/index.tsx`)
- **Dual-Mode Segmented Control:**
  - **Profiles Tab (Discovery Listing):**
    - Collapsible multi-criteria filter panel:
      - Gender selector: All, Brides (`FEMALE`), Grooms (`MALE`).
      - Marital status: Never Married, Divorced, Widowed.
      - Manglik status: Non-Manglik, Manglik, Anshik.
      - Sub-caste text filter (e.g., Kewat, Mallah, Nishad).
      - City text filter.
      - Active filter badge counter and one-click "Reset All Filters" action.
    - Server-side paginated `FlatList` with `onEndReached` (12 profiles/page).
    - Pull-to-refresh integration via `RefreshControl`.
    - Loading spinner, error state with retry, and empty state cards.
  - **Interests Tab (Connection Management):**
    - Sub-segmented tabs: **Received Requests** vs **Sent Requests**.
    - Lists incoming/outgoing connection requests with sender summary, message, timestamp, and status badges.
    - Inline **Accept** and **Decline** actions for received requests.
    - One-click navigation to candidate profile.
- **Express Interest Modal:**
  - Candidate identity summary banner.
  - Optional personal note input (max 500 characters with live counter).
  - Validation against duplicate submission with immediate feedback.

### 2. Matrimonial Profile Details Screen (`apps/mobile/app/(app)/matrimonial/[id].tsx`)
- **Safe Area & Navigation:** Dedicated back-navigation header displaying candidate name and community context.
- **Gallery Card:**
  - High-resolution primary photo with graceful fallback to initials avatar on load error.
  - Verification badge overlay (`✓ सत्यापित प्रोफ़ाइल`).
  - Horizontal photo thumbnail strip for multi-photo candidates with selection preview.
  - Header summary: Name, age, height (cm + feet/inches), gender badge, marital status badge, manglik badge, location.
- **Privacy-Guarded Contact Card:**
  - **Unlocked State (`isMutualAccepted: true`):** Prominently displays verified phone number with one-touch direct phone dialer (`tel:`) action.
  - **Locked State (`isMutualAccepted: false / null`):** Displays privacy shield banner explaining that contact phone is strictly safeguarded until mutual interest acceptance.
- **Structured Categorized Details:**
  1. *Personal & Physical Details:* Age, Height, Weight, Marital Status, Mother Tongue, Religion, Sub-caste, Gotra, Manglik.
  2. *Horoscope / Astrological Details:* Rashi, Nakshatra, Birth Time, Birth City (conditional on candidate input).
  3. *Education & Profession:* Highest Education, Education Details, Occupation, Employer/Company Name, Annual Income, Work Location.
  4. *Family Background:* Family Type (Joint/Nuclear), Father Name & Occupation, Mother Name & Occupation, Brothers (Total/Married), Sisters (Total/Married), Native Place, About Family.
  5. *Lifestyle & Habits:* Diet (Vegetarian/Non-Veg/Jain), Smoking, Drinking.
  6. *Narratives:* "About Me" and "Partner Expectations".
  7. *Partner Preferences:* Preferred age bounds, height bounds, preferred diet, manglik preference, special notes.
- **Safety & Moderation Actions:**
  - Dedicated "Report Profile" modal with reason categorization (`FAKE_PROFILE`, `INCORRECT_INFORMATION`, etc.).
  - Confirmation-guarded "Block Candidate" action with automatic return to discovery feed.

### 3. Matrimonial Card Component (`apps/mobile/src/components/MatrimonialCard.tsx`)
- Lightweight, reusable card component engineered for high-performance FlatList rendering.
- Displays candidate thumbnail, verification badge, gender pill, age, formatted height, career snippet, sub-caste, gotra, manglik tag, and city.
- Integrated interest action button / status pill (`रुचि भेजें`, `⏳ भेजी गई`, `💖 स्वीकृत`, `✕ अस्वीकृत`).

### 4. Navigation Architecture (`apps/mobile/src/components/BottomNavigation.tsx`)
- Added `matrimonial` to `NavTab` type and bottom navigation tabs:
  - 📰 **Feed** (`/(app)`)
  - 👥 **Members** (`/(app)/directory`)
  - 🏛️ **Groups** (`/(app)/groups`)
  - 💍 **Matrimony** (`/(app)/matrimonial`)
- Registered `matrimonial/index` and `matrimonial/[id]` in `apps/mobile/app/(app)/_layout.tsx`.

---

## 4. Privacy & Security Invariants Verification

1. **Physical Tenant Isolation:** All requests generated by `matrimonialApi` automatically attach `x-community-slug` via `apiClient.buildHeaders`. No queries leak across community databases.
2. **Server-Side Contact Masking:** The mobile client strictly adheres to `unlockedContact`. Phone numbers, email addresses, and private contact data are never exposed or predicted unless authorized by server-side mutual acceptance.
3. **Sensitive Field Omission:** Password hashes, reset tokens, internal admin review notes, and raw document storage paths are completely excluded from mobile models.
4. **Candidate Blocking & Moderation:** Blocked candidates are filtered by the backend `listDiscoveryProfiles` query, and reporting mechanisms allow members to flag bad actors directly.

---

## 5. Verification & Test Results

### 1. Automated Mobile Test Suite (`npm test --workspace=@apnasamaj/mobile`)
All **136 tests passed** (122 existing + 14 new matrimonial tests):
- ✅ PASS: `matrimonialApi.listProfiles`: requests paginated discovery profiles with headers
- ✅ PASS: `matrimonialApi.listProfiles`: serializes supported filter parameters properly
- ✅ PASS: `matrimonialApi.getProfileById`: fetches detailed public profile by UUID
- ✅ PASS: Privacy Invariant: contact details remain strictly locked when not mutually accepted
- ✅ PASS: Privacy Invariant: phone is disclosed ONLY when isMutualAccepted is explicitly true
- ✅ PASS: Tenant Isolation: API requests automatically inherit active community slug header
- ✅ PASS: `matrimonialApi.sendInterest`: sends interest request with receiverId and optional message
- ✅ PASS: `matrimonialApi.sendInterest`: rejects duplicate interest request with error
- ✅ PASS: `matrimonialApi.listReceivedInterests` & `listSentInterests` query endpoints with pagination
- ✅ PASS: `matrimonialApi.respondInterest`: patches interest status to ACCEPTED or DECLINED
- ✅ PASS: `matrimonialApi.reportProfile` and `blockProfile` submit security actions properly
- ✅ PASS: `formatHeightCm` converts centimeters to feet and inches accurately
- ✅ PASS: Localization: Matrimonial keys resolve cleanly in both Hindi and English
- ✅ PASS: `matrimonialApi.getProfileById`: propagates 401 Unauthorized for unauthenticated requests

### 2. Full Monorepo Typecheck (`npm run typecheck`)
Checked all 9 packages/workspaces:
- `@apnasamaj/admin`: 0 errors
- `@apnasamaj/api`: 0 errors
- `@apnasamaj/mobile`: 0 errors
- `@apnasamaj/web`: 0 errors
- `@apnasamaj/database`: 0 errors
- `@apnasamaj/i18n`: 0 errors
- `@apnasamaj/shared-types`: 0 errors
- `@apnasamaj/ui-config`: 0 errors
- `@apnasamaj/validation`: 0 errors
**Total TypeScript Errors: 0**

---

## 6. Files Created & Modified

| File Path | Action | Description |
| :--- | :---: | :--- |
| `apps/mobile/src/api/matrimonial.api.ts` | **Created** | Matrimonial API client methods (profiles, details, interests, report, block, own profile). |
| `apps/mobile/src/components/MatrimonialCard.tsx` | **Created** | Reusable native candidate card with verification, tags, and interest status. |
| `apps/mobile/app/(app)/matrimonial/index.tsx` | **Created** | Matrimonial discovery screen with profiles listing, filters, and interest management. |
| `apps/mobile/app/(app)/matrimonial/[id].tsx` | **Created** | Detailed profile view with gallery, multi-section bio, contact guard, report, and block. |
| `apps/mobile/src/tests/matrimonial-flow.test.ts` | **Created** | Automated unit and integration test suite covering 14 matrimonial requirements. |
| `apps/mobile/src/components/BottomNavigation.tsx` | **Modified** | Added `matrimonial` tab item with localized label and ring icon. |
| `apps/mobile/src/components/index.ts` | **Modified** | Exported `MatrimonialCard` and `formatHeightCm`. |
| `apps/mobile/app/(app)/_layout.tsx` | **Modified** | Registered `matrimonial/index` and `matrimonial/[id]` stack routes. |
| `apps/mobile/src/tests/test-runner.ts` | **Modified** | Mounted `runMatrimonialFlowTests` into the sequential test suite. |

---

## 7. Next Recommended Batch

- **Batch 7 (Mobile Track): Mobile Real-Time Chat & Direct Messaging (`apps/mobile/app/(app)/chat`)**
  - Integrate existing Socket.IO backend (`apps/api/src/modules/chat`) for real-time community group messaging and direct member conversations.

