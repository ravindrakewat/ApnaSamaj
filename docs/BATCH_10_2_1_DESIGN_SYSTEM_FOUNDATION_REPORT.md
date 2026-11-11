# Batch 10.2.1 — Unified Mobile Design System Foundation Report

**Date:** November 11, 2026  
**Status:** COMPLETED & VERIFIED  
**Target Platforms:** Android & iOS (React Native 0.76.9 + Expo SDK 52 + Expo Router v4)  
**Modified Workspaces:** `@apnasamaj/mobile`  
**Test Suite Status:** 361/361 Cumulative Mobile Tests Passing (100% success rate, +17 new foundation assertions) | 0 Monorepo Typecheck Errors across all 10 workspaces  

---

## 1. Executive Summary & Objective

The objective of **Batch 10.2.1** was to establish the production-ready foundation of the Apna Samaj Mobile Design System. This encompasses standardized design tokens, shared layout/interaction components (`AppHeader`, `SearchBar`, `ProfileAvatar`), complete TypeScript contracts, and comprehensive automated test coverage, while strictly preserving all existing screens and avoiding breaking changes.

---

## 2. Standardized Design Tokens

### A. Colors (`apps/mobile/src/theme/colors.ts`)
| Token | Hex Value | Purpose & Usage |
| :--- | :--- | :--- |
| `primary` | `#1976D2` | Apna Samaj Classic Blue — primary buttons, active tabs, header icons |
| `primaryDark` | `#1565C0` | Active press states and high-contrast rings |
| `primaryLight` | `#E3F2FD` | Light blue badge background |
| `primarySoft` | `#E0F2FE` | Soft sky blue — community slug pills, avatar fallback background |
| `primarySubtle` | `#EFF6FF` | Subtle row hover / selection highlight |
| `primaryBorder` | `#90CAF9` | Primary border accents |
| `background` | `#F8FAFC` | Clean slate off-white screen background |
| `surface` | `#FFFFFF` | Pure white cards, top navbar, modal sheets |
| `surfaceSubtle` | `#F1F5F9` | Subtle input background and dividers |
| `textPrimary` | `#0F172A` | Slate-900 — high-contrast headings, card titles, member names |
| `textBody` | `#334155` | Slate-700 — body descriptions, post content, dialog messages |
| `textSecondary` | `#475569` | Slate-600 — secondary metadata, subtitle labels |
| `textMuted` | `#64748B` | Slate-500 — timestamps, location text, icons |
| `textSubtle` | `#94A3B8` | Slate-400 — input placeholders, disabled elements |
| `border` | `#E2E8F0` | Universal 1px container and divider border |
| `success` / `successLight` | `#16A34A` / `#DCFCE7` | Active status badges, online indicators |
| `error` / `errorLight` | `#DC2626` / `#FEE2E2` | Error banners, destructive leave actions |
| `warning` / `warningLight` | `#F59E0B` / `#FEF3C7` | Private group indicators, pending states |
| `info` / `infoLight` | `#0284C7` / `#E0F2FE` | Informational chips, gotra badge pills |

### B. Border Radius (`apps/mobile/src/theme/borderRadius.ts`)
- Standard: `xs: 4`, `sm: 6`, `md: 8`, `lg: 12`, `xl: 16`, `xxl: 24`, `full: 9999`
- Semantic Aliases:
  - `card: 12` (standard content cards)
  - `button: 10` (interactive buttons)
  - `pill: 20` (search bars, filter chips, category tabs)

### C. Shadows & Elevations (`apps/mobile/src/theme/shadows.ts`)
- `topBar`: `elevation: 3` (Android), `shadowOpacity: 0.06` (iOS)
- `bottomNav`: `elevation: 8` (Android), `shadowOpacity: 0.08` (iOS)
- `card`: `elevation: 2` (Android), `shadowOpacity: 0.05` (iOS)

---

## 3. Reusable Components Implemented

### A. `AppHeader` (`apps/mobile/src/components/AppHeader.tsx`)
A unified navigation top bar designed to replace inconsistent hand-rolled headers across the app:
- **Mode `'brand'` (for primary tab screens):**
  - Left: 36×36 primary blue icon container (`#1976D2`) + screen title + community slug pill (`#E0F2FE` bg, `#0369A1` text).
  - Right: Language switcher pill (`English` / `हिन्दी`) + Profile avatar button with initial and navigation to `/(app)/profile`.
- **Mode `'detail'` (for nested/modal screens):**
  - Left: Back chevron button `←` with accessible `hitSlop={10}` calling `router.back()` or custom `onBackPress`.
  - Center/Left: Bold 16.5px title with optional subtitle.
  - Right: Optional `rightAccessory` actions (search, share, settings, etc.).
- **Safe Area Inset Handling:** Automatically applies `paddingTop: Math.max(insets.top, 10)` avoiding status bar overlap on notched iOS devices and Android punch-hole cameras.

### B. `SearchBar` (`apps/mobile/src/components/SearchBar.tsx`)
A standard full-width search input:
- **Visuals:** 44px height, `borderRadius: 22`, background `#FFFFFF`, border 1px `#E2E8F0`, elevation 1.
- **Features:**
  - Magnifying glass icon `🔍` in `#64748B`.
  - Controlled `value` and `onChangeText`.
  - Responsive `✕` clear action button.
  - Built-in loading state with `ActivityIndicator` (color `#1976D2`).
  - Optional filter trigger button (`showFilterButton`) with active count badge pill (`activeFilterCount > 0` turns solid primary blue with circular white count).

### C. `ProfileAvatar` (`apps/mobile/src/components/ProfileAvatar.tsx`)
A standardized avatar with initials fallback:
- **Size Tokens:**
  - `xs`: 28×28 (font 12)
  - `sm`: 36×36 (font 14)
  - `md`: 44×44 (font 17)
  - `lg`: 52×52 (font 20)
  - `xl`: 72×72 (font 28)
  - `number`: custom pixel diameter
- **Features:**
  - Remote image support with graceful `onError` fallback to initials.
  - Automatic initials computation: extracts first uppercase character from `name` or `initial`, defaulting to `'स'`.
  - Soft blue fallback canvas (`#E0F2FE`), primary blue initial (`#0369A1`), and subtle border ring (`#BAE6FD`).
  - Optional `onPress` interaction with touch feedback.

---

## 4. Component Exports

All 3 foundation components are exported through `apps/mobile/src/components/index.ts`:
```typescript
export * from './AppHeader';
export * from './SearchBar';
export * from './ProfileAvatar';
```

---

## 5. Verification & Test Suite Results

### A. Automated Mobile Test Suite
- Test Runner: `npm run test -w @apnasamaj/mobile`
- Suite Added: `apps/mobile/src/tests/design-system-foundation.test.ts`
- Total Tests: **361 / 361 Passed (100% success rate)**
  - Batch 1 Foundation: 22 Passed
  - Batch 2 Auth: 17 Passed
  - Batch 2.1 Auth Security: 5 Passed
  - Batch 4 Directory: 14 Passed
  - Batch 4.1 Directory Audit: 12 Passed
  - Batch 5 Matrimonial: 18 Passed
  - Batch 8.8 Reactions & Replies: 21 Passed
  - Batch 8.9 Search & Gallery: 9 Passed
  - Batch 8.10 Deletion & Moderation: 6 Passed
  - Batch 9.2 Unified Video Player: 41 Passed
  - Batch 9.2.1 Inline Video Playback: 22 Passed
  - Batch 10 Post Parity: 25 Passed
  - **Batch 10.2.1 Design System Foundation: 17 Passed**

### B. Monorepo TypeScript Verification
- Command: `npm run typecheck`
- Result: **0 errors across all 10 workspaces** (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/mobile`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`, root).

---

## 6. Git Working Tree State

```text
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   apps/mobile/app/(app)/directory/index.tsx
  modified:   apps/mobile/src/components/MemberCard.tsx
  modified:   apps/mobile/src/components/index.ts
  modified:   apps/mobile/src/tests/test-runner.ts
  modified:   apps/mobile/src/theme/borderRadius.ts
  modified:   apps/mobile/src/theme/colors.ts
  modified:   apps/mobile/src/theme/shadows.ts
  modified:   docs/MOBILE_APP_DEVELOPMENT_DASHBOARD.md
  modified:   docs/PROJECT_HISTORY.md

Untracked files:
  apps/mobile/src/components/AppHeader.tsx
  apps/mobile/src/components/ProfileAvatar.tsx
  apps/mobile/src/components/SearchBar.tsx
  apps/mobile/src/tests/design-system-foundation.test.ts
  apps/mobile/src/tests/mocks/expo-router.ts
  docs/BATCH_10_1_2_MEMBER_DIRECTORY_UI_UX_REPORT.md
  docs/BATCH_10_2_MOBILE_UI_ARCHITECTURE_AUDIT.md
  docs/BATCH_10_2_1_DESIGN_SYSTEM_FOUNDATION_REPORT.md
```

All uncommitted work from Batch 10.1.2, Batch 10.2, and Batch 10.2.1 is safely preserved. Zero code has been staged or pushed.

