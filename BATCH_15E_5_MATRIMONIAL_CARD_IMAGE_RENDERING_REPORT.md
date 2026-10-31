# BATCH 15E.5 REPORT — Matrimonial Listing Cards Image Rendering & Fallback Fix

## 1. Overview & Context
- **Batch ID:** `15E.5`
- **Module:** Matrimonial Discovery Listing Cards & Image Rendering (`/matrimonial`)
- **Author:** Antigravity AI Assistant
- **Date:** 2026-11-01
- **Issue:** On the Matrimonial listing page (`/matrimonial`), profile cards displayed a default placeholder avatar instead of the member's actual matrimonial photos, while opening "VIEW FULL PROFILE" displayed the images correctly.

## 2. Exact Root Cause Analysis
1. **Omitted Photo Query in Backend Listing API:**
   In `apps/api/src/modules/matrimonial/matrimonial.service.ts`, `listDiscoveryProfiles` queried photos as:
   ```typescript
   photos: {
     where: { isApproved: true },
     select: { id: true }, // Only selected id to calculate photosCount!
   }
   ```
   It did **not** select `url`, `isPrimary`, or `order`. Consequently, matrimonial photo URLs were completely stripped from the database query result.
2. **Incorrect Field Mapping in Serializer:**
   When serializing database records into `PublicMatrimonialProfileListItem`, the backend mapped:
   ```typescript
   avatarUrl: p?.avatarUrl || null,
   ```
   This only forwarded the user's general community account avatar (`User.profile.avatarUrl`). Because members frequently upload photos specifically to their matrimonial profile (`MatrimonialPhoto`) without setting a separate general community avatar, `avatarUrl` evaluated to `null`.
3. **Frontend Listing Card Assumption:**
   In `apps/web/src/pages/MatrimonialDiscoveryPage.tsx`, the card component resolved image via:
   ```tsx
   const primaryPhotoUrl = p.avatarUrl; // public avatar or primary photo
   ```
   Because `p.avatarUrl` was `null` and no matrimonial photo URL was provided by the API, `primaryPhotoUrl` was falsy, falling back directly to `<Avatar><PersonIcon /></Avatar>` (the default placeholder).
4. **Discrepancy with Full Profile Page:**
   In contrast, `getPublicProfileDetail` (`/api/v1/matrimonial/profiles/:id`) queried `photos` with all fields and returned `profile.photos` array. `MatrimonialProfileDetailPage.tsx` checked `activePhoto.url` first, which is why Full Profile displayed the matrimonial photos correctly.
5. **Missing `onError` Fallback on Listing Card:**
   The `<CardMedia>` component had no error handling. If an image URL was broken or unreachable, the browser displayed a broken-image placeholder rather than gracefully reverting to the default avatar.

## 3. Implemented Fixes

### A. Shared Types Definition (`packages/shared-types/src/matrimonial.ts`)
- Added optional `primaryPhotoUrl?: string | null;` to `PublicMatrimonialProfileListItem` and `AdminMatrimonialProfileListItem` to establish a distinct, unambiguous contract for the primary matrimonial image.

### B. Backend Photo Selection & Prioritization (`matrimonial.service.ts` & `admin.matrimonial.service.ts`)
- Updated `listDiscoveryProfiles`, `listReceivedInterests`, and `listSentInterests` to query:
  ```typescript
  photos: {
    where: { isApproved: true },
    select: { id: true, url: true, isPrimary: true, order: true },
    orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }],
  }
  ```
- Computed `primaryPhotoUrl`:
  1. Checks for an approved photo where `isPrimary === true`.
  2. Falls back to the first approved photo in order (`photos[0]`).
  3. Falls back to the community avatar (`user.profile.avatarUrl`).
  4. Returns `null` if no image exists.
- Populated both `primaryPhotoUrl` and `avatarUrl` (for backward compatibility) on all returned list items.

### C. Frontend Listing Card & Error Handling (`MatrimonialDiscoveryPage.tsx`)
- Created a dedicated `MatrimonialCardMedia` component that tracks image loading failures via `onError` and automatically resets on URL changes.
- Prioritizes `p.primaryPhotoUrl || p.avatarUrl`.
- If no image is provided or if the image fails to load, gracefully displays the default `<Avatar>` with `<PersonIcon />`.
- Preserves aspect ratio with `objectFit: 'cover'`.

### D. Consistency Updates Across Matrimonial Views
- Updated `ReceivedInterestsList.tsx` and `SentInterestsList.tsx` to read `profile?.primaryPhotoUrl || profile?.avatarUrl`.
- Added image error boundary fallback to `MatrimonialProfileDetailPage.tsx`.

## 4. Verification & Test Results
- **Frontend Card Image Tests (`apps/web/src/tests/matrimonial-card-images.test.ts`):**
  - ✅ Listing card with valid primary photo prioritizes matrimonial photo over avatar.
  - ✅ Multiple matrimonial photos select the marked primary photo.
  - ✅ Profile with no images safely falls back to default avatar.
  - ✅ Failed image request (`onError`) safely falls back to default avatar without crashing.
  - ✅ Exact consistency between listing card and Full Profile image selection confirmed.
  - ✅ Matrimonial photo privacy & moderation filtering verified (unapproved photos strictly excluded).
  - **Result: 10/10 Passed.**
- **Backend Matrimonial Logic Suite (`apps/api/src/tests/matrimonial.test.ts`):**
  - Section 14 primary photo selection & consistency assertions added.
  - **Result: 77/77 Passed.**
- **Admin Moderation & Tenant Security Suites:**
  - `admin-matrimonial.test.ts`: **23/23 Passed.**
  - `tenant-security-hardening.test.ts`: **64/64 Passed.**
  - `matrimonial-interests.test.ts`: **18/18 Passed.**
  - `matrimonial-submission.test.ts`: **10/10 Passed.**
- **Monorepo Typecheck (`npm run typecheck`):**
  - All 8 workspaces passed with **0 errors**.
- **Production Builds:**
  - `npm run build:api`: Passed cleanly (**0 errors**).
  - `npm run build -w @apnasamaj/web`: Built cleanly via Vite in 19.23s (**0 errors**).

## 5. Privacy & Tenant Security Invariants
- **Moderation Boundary:** Public discovery listings query strictly `where: { isApproved: true }`. Unapproved or rejected photos are never exposed in listing or detail payloads.
- **Tenant Isolation:** All database calls execute through `assertDb(req.db)`, bound to the tenant physical database context.
- **Zero Schema Migrations Required:** Reuses existing `MatrimonialPhoto` fields (`url`, `isPrimary`, `isApproved`, `order`).

