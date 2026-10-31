# Apna Samaj — Batch 15E.3B: Shared Multilingual Foundation & Web App Language Selector Report

**Date:** October 31, 2026<br>
**Auditor / Roles:** Senior Frontend & Platform Architect<br>
**Repository:** `ravindrakewat/ApnaSamaj` (`https://github.com/ravindrakewat/ApnaSamaj.git`)<br>
**Active Branch:** `main`<br>
**Base Commit / Checkpoint:** `e89aeeea0867fc610193ef135918585a53538364` (`e89aeee`)<br>
**Status:** COMPLETE & VERIFIED (Zero regressions, 206 test assertions passed, full monorepo typecheck & build passing)

---

## 1. Executive Summary

In Batch 15E.3B, we implemented the first phase of the multilingual architecture planned in `BATCH_15E_3A_MULTILINGUAL_ARCHITECTURE_PLAN.md`.

Key achievements:
1. **Created Shared `@apnasamaj/i18n` Package:** Built a dedicated, reusable workspace package at `packages/i18n` wrapping `i18next`, `react-i18next`, and `i18next-browser-languagedetector`.
2. **Foundational Dual-Language Catalogs (Hindi default + English):** Established 4 core translation namespaces (`common.json`, `nav.json`, `auth.json`, `notifications.json`) with 100% key parity between Hindi (`hi`) and English (`en`), preserving all authentic Hindi UI strings and providing clear English equivalents.
3. **Language Detection & Client Persistence:**
   - Hierarchy: Explicit `localStorage` selection (`apna_samaj_lang`) > Supported browser locale (`navigator.language`) > Default fallback (`hi`).
   - Zero full-page reload required on switch; dynamic `<html lang="...">` synchronization and reactive UI updates via React Context.
4. **Accessible `LanguageSelector` Component:** Created `apps/web/src/components/LanguageSelector.tsx` featuring accessible `aria-*` tags, keyboard navigation, native labels (`हिन्दी` / `English`), checkmark indicators, and responsive views (compact icon for mobile `xs`, labeled button for desktop `sm`+).
5. **Navbar Localization Integration:** Mounted `<LanguageSelector />` in `Navbar.tsx` adjacent to `NotificationBell` for authenticated users and before auth actions for guests. Converted all 11 navigation chrome labels to translation keys.
6. **Typography Font Stack Update:** Updated `packages/ui-config/src/theme.ts` to include native system Indic font fallbacks (`"Noto Sans Devanagari"`, `"Nirmala UI"`, `"Kohinoor Devanagari"`) to ensure crisp Devanagari rendering across Windows, macOS, iOS, Android, and Linux without external network font downloads.
7. **Verification & Tests:** Created `apps/web/src/tests/multilingual-foundation.test.ts` with 26 focused assertions covering default Hindi invariant, browser language detection, storage precedence, language switching, translation parity, and architectural invariants. All 26 passed. Ran all 5 existing web test suites (180 assertions) for a total of **206 live verified assertions**. Ran monorepo-wide `typecheck` and `build` across all 8 workspaces with 0 errors.

---

## 2. File Modification & Creation Inventory

```text
packages/i18n/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── constants.ts
    ├── types.ts
    ├── resources.ts
    ├── i18n.ts
    └── locales/
        ├── hi/
        │   ├── common.json
        │   ├── nav.json
        │   ├── auth.json
        │   └── notifications.json
        └── en/
            ├── common.json
            ├── nav.json
            ├── auth.json
            └── notifications.json

apps/web/package.json                             | dependencies updated
apps/web/src/App.tsx                              | wrapped with <I18nextProvider>
apps/web/src/components/Navbar.tsx                | localized labels & mounted selector
apps/web/src/components/LanguageSelector.tsx      | new responsive selector component
apps/web/src/tests/multilingual-foundation.test.ts| 26 unit & integration tests
packages/ui-config/src/theme.ts                   | typography font stack updated
package-lock.json                                 | lockfile updated for i18n libs
docs/PROJECT_HISTORY.md                           | recorded Batch 15E.3B progress
```

---

## 3. Language Resources & Namespaces

| Namespace | Focus / Scope | Keys in `hi` | Keys in `en` | Parity Status |
|:---|:---|:---:|:---:|:---:|
| `nav.json` | Top navbar links, brand subtitle, language selector aria labels | 14 | 14 | 100% Match |
| `common.json` | Shared actions (Save, Cancel, Edit, Delete, Search, Refresh, Back), App Name | 16 | 16 | 100% Match |
| `auth.json` | Login/register titles, phone, password, forgot/reset password buttons | 11 | 11 | 100% Match |
| `notifications.json` | Notification modal titles, mark all read, all/unread tabs, empty states | 10 | 10 | 100% Match |

### Architectural Invariants Preserved:
- **User-generated content untouched:** Posts, comments, author names, community group names, and bios are strictly not auto-translated.
- **Clean routing:** No `/hi/` or `/en/` path prefixing; all existing deep links, test fixtures, and routing contracts remain unchanged.
- **Physical multi-tenant isolation:** Zero changes to `req.db`, `x-community-slug`, or backend tenant boundaries.

---

## 4. Test & Verification Results

### A. Focused Multilingual Test Suite (`multilingual-foundation.test.ts`)

| Test Category | Description | Result |
|:---|:---|:---:|
| **1. Default Language Invariant** | `DEFAULT_LANGUAGE === 'hi'`, `SUPPORTED_LANGUAGES === ['hi', 'en']`, native label mapping | **PASS** |
| **2. Browser Language Detection** | Normalizes exact codes (`hi`, `en`) and regional variants (`en-US`, `hi-IN`, case-insensitivity) | **PASS** |
| **3. Unsupported Fallback** | Fallback to `null` -> default `'hi'` for unsupported locales (`fr`, `de`, `es`, `zh`, `ja`) | **PASS** |
| **4. Preference Precedence** | Saved `localStorage` (`apna_samaj_lang`) strictly overrides browser locale; invalid values ignored | **PASS** |
| **5. Dynamic Language Switching** | `changeLanguage('en')` and `changeLanguage('hi')` update instance, localStorage, and `<html lang="...">` | **PASS** |
| **6. Catalog Completeness** | 100% key parity across `common`, `nav`, `auth`, `notifications` namespaces with zero empty values | **PASS** |
| **7. Navbar Translation Values** | Preserves original Hindi navigation strings and accurate English translations | **PASS** |
| **8. i18n Instance Execution** | `i18n.t` returns correct translated strings in both active languages | **PASS** |
| **9. Invariants & Stability** | Stable storage key `apna_samaj_lang`, user content non-translation, clean URL routing paths | **PASS** |

**Multilingual Tests Completed:** **26 passed, 0 failed.**

### B. Monorepo Regression Test Suites

| Test Suite File | Scope | Result |
|:---|:---|:---:|
| `multilingual-foundation.test.ts` | Shared i18n engine, detection, switching, parity | **26 / 26 PASS** |
| `social-feed-frontend-ux.test.ts` | Feed search, debouncing, URL sync, Hindi empty states | **27 / 27 PASS** |
| `notifications-experience.test.ts` | Route resolution, unread queries, optimistic counts | **37 / 37 PASS** |
| `groups-frontend-ux.test.ts` | Privacy invariants, group feeds, roster pagination | **57 / 57 PASS** |
| `auth-password-reset-ux.test.ts` | Anti-enumeration, token preflight, client validation | **33 / 33 PASS** |
| `directory-frontend-ux.test.ts` | Member directory search, filters, pagination | **26 / 26 PASS** |

**Total Live Verified Assertions:** **206 passed, 0 failed, 0 skipped.**

### C. Build & Typecheck Verification

- **`npm run typecheck` across all 8 workspaces:** **PASS (exit code 0)**
  - `@apnasamaj/admin`: `tsc --noEmit` (PASS)
  - `@apnasamaj/api`: `tsc --noEmit` (PASS)
  - `@apnasamaj/web`: `tsc --noEmit` (PASS)
  - `@apnasamaj/database`: `tsc --noEmit` (PASS)
  - `@apnasamaj/i18n`: `tsc --noEmit` (PASS)
  - `@apnasamaj/shared-types`: `tsc --noEmit` (PASS)
  - `@apnasamaj/ui-config`: `tsc --noEmit` (PASS)
  - `@apnasamaj/validation`: `tsc --noEmit` (PASS)
- **`npm run build` across all workspaces:** **PASS (exit code 0)**
  - `@apnasamaj/admin`: Vite bundle (PASS)
  - `@apnasamaj/api`: Prisma generate + tsc (PASS)
  - `@apnasamaj/web`: Vite bundle (PASS)
  - All shared packages: tsc compilation (PASS)

---

## 5. Known Limitations & Next Recommended Batch

### Known Scope Limitations (By Design in Phase 1):
- **Page-level UI Chrome:** Feed, Groups, Member Directory, Matrimonial, and Auth forms currently still contain English/Hindi inline labels. Their translation namespaces (`auth`, `notifications`, etc.) are now available and primed for component migration in subsequent batches.
- **Cross-device Persistence:** Preference is currently persisted in browser `localStorage`. Authenticated profile persistence (`Profile.preferredLanguage`) is planned for Phase 4.

### Exact Next Recommended Batch:
**Batch 15E.3C — Notifications Dropdown Hindi Localization & Full-Page UX**
- Migrate [`NotificationBell.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/components/NotificationBell.tsx) to consume `@apnasamaj/i18n` with the `notifications` namespace.
- Translate header ("सूचनाएं"), action button ("सभी पढ़ी हुई मार्क करें"), tabs ("सभी" / "अपठित"), and empty states.
- Localize relative timestamp formatter into Hindi ("अभी", "५ मिनट पहले", "२ घंटे पहले", "३ दिन पहले").
- Add dedicated `/notifications` responsive route for mobile devices.
