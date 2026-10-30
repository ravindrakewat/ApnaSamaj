# Apna Samaj — Batch 15B.5: Member Directory Frontend Audit & Implementation Plan

**Status:** COMPLETE (AUDIT & PLANNING ONLY)  
**Date:** 2026-10-30  
**Target Monorepo:** `c:\sunil kewat\dsas158\ApnaSamaj`  
**Git Checkpoint Reference:** Commit `ac336d4` (`feat(directory): member directory query bounds, sub-caste filter, uuid validation, and staging e2e verification`)  
**Scope:** Frontend Architecture, UX Gap Analysis, Privacy Invariants, and Implementation Roadmap for Member Directory Web Experience.

---

## 1. Verified Repository State

A read-only Git audit was conducted on the repository:
- **Current Branch:** `main`
- **Current Local HEAD:** `ac336d45b2cb3201216fb473d9c4cf5640c59189`
- **Parent Commit:** `eb82c0dc43e436282c618e1d6deee18ded3bcdc3`
- **Remote Tracking Reference (`origin/main`):** `88ce7b87b0ba258782b6e89174b7167d5318cb7c`
- **Branch Divergence:** Local `main` is ahead of `origin/main` by exactly 3 commits:
  1. `f7ac1b5`: `feat(staging): local postgres staging environment, appeals e2e verification, and batch 14o/14p reports`
  2. `eb82c0d`: `feat(auth): member self-service password reset, staging e2e verification, and batch 15a reports`
  3. `ac336d4`: `feat(directory): member directory query bounds, sub-caste filter, uuid validation, and staging e2e verification`
- **Working Tree State:** Completely clean. Zero staged or unstaged modifications in tracked files. The only untracked file is `BATCH_15B_4_CHECKPOINT_REPORT.md`.

---

## 2. Existing Frontend Implementation

### 2.1 Web Routing & Navigation Architecture
- **Route Definitions ([`apps/web/src/App.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/App.tsx#L88-L118)):**
  - `/directory` mounts `<DirectoryPage />` inside `<ProtectedRoute>`.
  - `/members/:id` mounts `<MemberProfilePage />` inside `<ProtectedRoute>`.
  - Both pages utilize route-level lazy loading (`React.lazy`) with `<PageFallback>` suspense boundaries (`CircularProgress`).
- **Navigation Bar ([`apps/web/src/components/Navbar.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/components/Navbar.tsx#L84-L92)):**
  - Includes a direct "Directory" button with `PeopleIcon` for authenticated members.
  - Highlights active route when `location.pathname === '/directory'`.
- **Session Protection ([`apps/web/src/components/ProtectedRoute.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/components/ProtectedRoute.tsx)):**
  - Verifies `user` state from `AuthContext`.
  - Redirects unauthenticated visitors to `/login` with preservation of return location (`state: { from: location }`).

### 2.2 Existing Member Directory Page ([`apps/web/src/pages/DirectoryPage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/DirectoryPage.tsx))
- **Hero Banner:** Displays community directory title and dynamic badge with total verified member count.
- **Search & Filters:**
  - Free-text search with 400ms debounce.
  - City filter (`cityFilter`).
  - State filter (`stateFilter`).
  - Gotra filter (`gotraFilter`).
  - "Reset Filters" action when active filters exist.
- **Loading State:** 6 animated Material UI `<Skeleton>` cards mimicking the grid layout.
- **Error State:** `<Alert severity="error">` with an embedded "Retry" action button.
- **Empty State:** Bordered paper container with `AccountCircleIcon`, clear messaging, and a "Clear All Filters" button.
- **Member Cards Grid:** Responsive Material UI `<Grid>` (1 column on mobile `xs`, 2 on tablet `sm`, 3 on desktop `md`).
  - Member avatar with first-letter fallback and hover elevation.
  - Verified member badge.
  - Chips for location (`city, state`), `gotra`, and `subCaste`.
  - Truncated 2-line bio (`-webkit-line-clamp: 2`).
  - Card footer with joined date (`toLocaleDateString('en-IN')`) and gender.
  - Clickable avatar and name navigating to `/members/${member.id}`.
- **Pagination:** `<Pagination>` component with rounded buttons, first/last navigation, and page jump handlers.

### 2.3 Existing Member Profile Page ([`apps/web/src/pages/MemberProfilePage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/MemberProfilePage.tsx))
- Route parameter extraction via `useParams<{ id: string }>()`.
- Header gradient banner and overlapping avatar.
- Role badges (`MODERATOR`, `COMMUNITY_ADMIN`, etc.) displayed when member holds administrative roles.
- Bio block with left border accent and italicized formatting.
- Community information cards for Location, Gotra, Sub-Caste, and Gender.
- "Back" button navigating to directory or browser history.
- Error handling displaying alert with "Back to Directory" action.

---

## 3. Actual API Contract & Service Layer

### 3.1 Backend API Endpoints

| Method | Endpoint | Query / Path Parameters | Middleware / Security | Response Payload |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users` | `page` (default 1)<br>`limit` (default 12, max 50)<br>`search` (max 100)<br>`city` (max 100)<br>`state` (max 100)<br>`gotra` (max 100)<br>`subCaste` (max 100) | `authenticateToken`<br>`requireActiveUser`<br>`requireTenantContext` | `{ success: true, data: { members: PublicDirectoryMember[], pagination: { page, limit, totalMembers, totalPages } }, timestamp }` |
| `GET` | `/api/v1/users/:id` | `id` (must be valid UUID format) | `authenticateToken`<br>`requireActiveUser`<br>`requireTenantContext` | `{ success: true, data: PublicMemberProfile, timestamp }` |

### 3.2 Error Responses
- **Malformed UUID:** HTTP 400 with `{ success: false, error: "Invalid member ID format. Expected a valid UUID." }`.
- **Query Filter Exceeding 100 Chars:** HTTP 400 with specific Zod message.
- **Page Size Exceeding 50:** HTTP 400 with `Number must be less than or equal to 50`.
- **Unavailable / Suspended / Cross-Tenant Member:** HTTP 404 with `{ success: false, error: "Member profile not found or unavailable." }`.
- **Missing / Unresolved Tenant:** HTTP 400 with `{ success: false, error: "Community context and tenant database are required..." }`.

### 3.3 Web API Client ([`apps/web/src/services/api.client.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/services/api.client.ts))
- **Tenant Context (`X-Community-Slug`):** Automatically injected on every request via `getActiveCommunitySlug()`.
- **Authorization (`Bearer <token>`):** In-memory access token attached to every outgoing request.
- **Session Refresh:** Automatic 401 interception with coalesced token refresh and transparent single retry.

---

## 4. Reusable Components & Styling System

The platform strictly uses **Material UI v5** with the centralized theme from `@apnasamaj/ui-config`:
- **Theme Palette:**
  - `primary.main`: `#1976d2` (Navy/Blue)
  - `secondary.main`: `#9c27b0` (Purple)
  - `background.default`: `#f8fafc` (Light slate grey)
  - `background.paper`: `#ffffff`
  - `shape.borderRadius`: `8px`
- **Typography:** System fonts (`-apple-system`, `BlinkMacSystemFont`, `Roboto`, `Segoe UI`).
- **Icons:** `@mui/icons-material` (`Search`, `Clear`, `LocationOn`, `Verified`, `CalendarToday`, `People`, `Refresh`, `AutoStories`, `AccountCircle`, `Person`).
- **No Third-Party CSS Framework Conflicts:** No Tailwind, Bootstrap, or styled-components outside Emotion.

---

## 5. UI Gaps & Opportunities for Refinement

While the current frontend is functional, the audit identified 6 concrete gaps:

### Gap 1: Missing `subCaste` Filter Input in `DirectoryPage.tsx`
- **Current State:** In Batch 15B.2, the backend and web service were updated to support `subCaste`. However, `DirectoryPage.tsx` currently only renders input fields for `search`, `city`, `state`, and `gotra`.
- **Fix:** Add a dedicated Sub-Caste filter input (`subCasteFilter` state), wire it into `loadMembers()`, `hasActiveFilters`, and `handleClearFilters()`.

### Gap 2: Uncoordinated Debouncing Across Filter Inputs
- **Current State:** Only `searchTerm` has a 400ms debounce. Changing `cityFilter`, `stateFilter`, or `gotraFilter` triggers an immediate network request on every single keystroke.
- **Fix:** Consolidate all text filters into a debounced filter state object, firing API queries 400ms after the user stops typing in *any* filter field.

### Gap 3: Missing Client-Side Input Length Constraints
- **Current State:** Text fields lack `inputProps={{ maxLength: 100 }}`. If a user pastes more than 100 characters, the backend immediately rejects the request with HTTP 400.
- **Fix:** Add `inputProps={{ maxLength: 100 }}` to all filter text fields to prevent invalid submissions.

### Gap 4: URL Search Parameter Synchronization (Deep Linking & Bookmarking)
- **Current State:** Filter state lives purely in React component state. Refreshing the browser or sharing a URL clears the user's search and pagination.
- **Fix:** Two-way sync filter state with URL query parameters (`useSearchParams`), allowing users to share URLs like `/directory?search=Kewat&city=Indore&page=2`.

### Gap 5: Filter Bar Layout & Responsiveness
- **Current State:** Adding a 5th filter (`subCaste`) to a single row would crowd smaller laptop screens.
- **Fix:** Organize filters using a clean, responsive 2-tier layout:
  - Top row: Search input (wide) + Quick Reset button.
  - Bottom row: City, State, Sub-Caste, and Gotra filters (equal-width grid items).

### Gap 6: Accessibility (A11y) & Aria Labels
- **Current State:** Some inputs and buttons lack explicit `aria-label` attributes.
- **Fix:** Add `aria-label` to all search inputs, clear icons, and pagination elements.

---

## 6. Privacy & Tenant Isolation Considerations

### 6.1 Absolute PII Non-Exposure
The frontend must strictly adhere to the privacy boundaries established in Batch 15B.1 and 15B.2:
- **Phone Numbers:** `User.phone` is never requested or rendered in directory cards or public profiles.
- **Date of Birth:** `Profile.dateOfBirth` is strictly omitted from public views.
- **Password Hashes & Tokens:** Zero exposure or storage in state/storage.
- **Account Status:** Internal account status (`ACTIVE`, `PENDING`, `SUSPENDED`) is not exposed.

### 6.2 Server-Side Pagination Invariant
- The frontend must never fetch all members at once or paginate client-side in memory.
- All pagination must be server-driven using bounded `limit=12` and dynamic `page` parameters.

### 6.3 Tenant Context Propagation
- `fetchDirectory` and `getPublicProfileApi` must always communicate with the current tenant context (`X-Community-Slug` header).
- Cross-tenant requests fail closed with HTTP 404.

---

## 7. Exact Proposed Files to Create or Modify (Batch 15B.6)

### 7.1 Files to Modify (2 files)
1. **[`apps/web/src/pages/DirectoryPage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/DirectoryPage.tsx):**
   - Add `subCaste` filter state and UI input.
   - Implement consolidated 400ms debouncing across all 5 text filters.
   - Add `inputProps={{ maxLength: 100 }}` to all inputs.
   - Synchronize filter and pagination state with URL search params (`useSearchParams`).
   - Enhance accessibility with `aria-label` tags.
2. **[`apps/web/src/pages/MemberProfilePage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/MemberProfilePage.tsx):**
   - Enhance error state for unavailable/invalid profiles with clear user feedback.
   - Add accessibility attributes.

### 7.2 Files to Create (1 file)
3. **`apps/web/src/tests/directory-frontend-ux.test.ts`:**
   - Dedicated frontend automated test suite covering:
     - URL search param serialization and parsing.
     - 100-character input length boundary validation.
     - Filter debouncing and parameter mapping.
     - Privacy verification (zero phone, DOB, password, or token fields).
     - Error state handling for 400 malformed UUID and 404 not found.
     - Server-side pagination calculation and boundary enforcement.

---

## 8. Implementation Sequence for Batch 15B.6

```
   ┌─────────────────────────────────────────────────────────────┐
   │ Step 1: Directory Page Layout & Filter State Modernization  │
   │ - Add subCaste filter state & input field                   │
   │ - Implement responsive 2-tier filter layout                 │
   │ - Add inputProps={{ maxLength: 100 }} to all text inputs    │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
   ┌──────────────────────────────▼──────────────────────────────┐
   │ Step 2: Unified Debounce & URL Synchronization              │
   │ - Combine filters into single debounced state object (400ms)│
   │ - Sync state with React Router useSearchParams              │
   │ - Ensure browser back/forward history preserves search state│
   └──────────────────────────────┬──────────────────────────────┘
                                  │
   ┌──────────────────────────────▼──────────────────────────────┐
   │ Step 3: Profile Page UX & Error Refinement                  │
   │ - Improve invalid/suspended profile error presentation      │
   │ - Verify accessibility attributes and semantic HTML         │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
   ┌──────────────────────────────▼──────────────────────────────┐
   │ Step 4: Automated Frontend Test Suite                       │
   │ - Create apps/web/src/tests/directory-frontend-ux.test.ts   │
   │ - Execute test suite via npx tsx                            │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
   ┌──────────────────────────────▼──────────────────────────────┐
   │ Step 5: Full Monorepo Typecheck & Production Build          │
   │ - npm run typecheck across all 7 workspaces                 │
   │ - npm run build across all 7 workspaces                     │
   └─────────────────────────────────────────────────────────────┘
```

---

## 9. Test Plan & Acceptance Criteria

### 9.1 Acceptance Criteria
- **AC-1 (Sub-Caste Filter):** The directory interface provides a Sub-Caste text field. Entering a sub-caste (e.g. `Kashyap`) filters the members accordingly.
- **AC-2 (Search & Filter Consolidation):** Typing in any filter (Search, City, State, Sub-Caste, Gotra) debounces for 400ms before making a single API request.
- **AC-3 (Input Length Limits):** No filter text input permits more than 100 characters.
- **AC-4 (Reset Filters):** Clicking "Reset Filters" clears all 5 filter fields and resets pagination to page 1.
- **AC-5 (Server-Side Pagination):** Navigating between pages triggers a server request for the respective page (`limit=12`).
- **AC-6 (Public Profile Navigation):** Clicking a member card or avatar opens `/members/:id`.
- **AC-7 (Privacy Invariant):** Neither the directory cards nor the member profile page ever display or request phone numbers, dates of birth, password hashes, or auth tokens.
- **AC-8 (Error & 404 Handling):** Navigating to a non-existent or malformed UUID displays a clear error alert with a "Back to Directory" button.
- **AC-9 (Loading & Empty States):** Skeletons render during in-flight queries; friendly empty state displays when 0 results match.
- **AC-10 (URL Sync):** Querying `/directory?search=Kewat&city=Indore` automatically initializes the input fields and loads the matching records.

---

## 10. Risks, Blockers & Unresolved Questions

- **Risks:** Two-way URL synchronization (`useSearchParams`) must be implemented carefully with `useMemo` / `useCallback` to avoid redundant fetch cycles or infinite render loops.
- **Blockers:** **NONE.** The backend API endpoints and staging environment are fully hardened, verified, and committed.
- **Unresolved Questions:** None. The MUI component library and styling system provide all necessary primitives.

---

## 11. Final Recommendation

### **Recommendation: GO FOR BATCH 15B.6 (Member Directory Frontend Implementation)**

The Member Directory frontend architecture is well-structured, modular, and ready for refinement. Adding the missing Sub-Caste filter, unified debouncing, client-side input limits, and URL search param synchronization will complete a production-grade directory experience.

*In accordance with the read-only audit mandate, no application code was modified, no tests were rerun against live databases, and no Git operations were performed.*

