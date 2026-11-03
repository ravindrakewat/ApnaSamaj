# Apna Samaj — Batch 1: Mobile Application Foundation Report
## Lightweight, Performance-First React Native & Expo Architecture

**Batch Reference:** Batch 1 (Mobile Track)  
**Target Workspace:** `apps/mobile`  
**Git Branch:** `main`  
**Base Commit SHA:** `a4895ade19cc38a63db6f3c309480561ac17c58b`  
**Date:** November 3, 2026  
**Status:** ✅ Fully Implemented, Tested & Verified (18/18 Expo Doctor Checks Passed, 19/19 Unit Tests Passed, 0 Typecheck Errors Across All 9 Workspaces, 2.61 MB Hermes Bytecode Bundle)

---

## 1. Existing Project Architecture Inspected

Prior to touching any code or creating workspace structures, the monorepo architecture and existing applications were thoroughly inspected:
- **Monorepo Structure:** npm workspaces containing `apps/` (`web`, `admin`, `api`, `mobile`) and `packages/` (`database`, `shared-types`, `validation`, `ui-config`, `i18n`).
- **Backend API & Authentication (`apps/api`):**
  - Node.js / Express / TypeScript running on port 5000.
  - Authentication via `POST /api/v1/auth/login` (phone + password) and `POST /api/v1/auth/register`.
  - Session management supports both browser `HttpOnly` cookies and native clients: `loginHandler` returns `{ accessToken, refreshToken, user: AuthUser }` in the response body.
  - Token refresh via `POST /api/v1/auth/refresh` accepts `{ refreshToken }` in the request body.
  - Multi-tenant boundary: Requests supply community tenant context via `x-community-slug` header, authenticated via `req.db` and guarded by `assertDb(req.db)`.
- **Localization (`packages/i18n`):**
  - Default language: Hindi (`hi`), secondary: English (`en`).
  - 8 standard translation namespaces (`common`, `nav`, `auth`, `notifications`, `feed`, `directory`, `groups`, `matrimonial`).
  - Resources stored in `resources.ts` with 100% Hindi/English key parity.
- **Brand & Design Tokens (`packages/ui-config`):**
  - Brand Primary: Classic Blue (`#1976D2`), Dark (`#1565C0`), Light (`#E3F2FD`).
  - Secondary: Community Purple (`#9C27B0`).
  - Clean Background: `#F8FAFC`, Surface Card: `#FFFFFF`.

---

## 2. Mobile Application Architecture Created

`apps/mobile` was established with a performance-oriented, low-RAM directory structure tailored for Expo Router:

```text
apps/mobile/
├── app/                               # File-based Expo Router Navigation
│   ├── _layout.tsx                    # Root Layout with Safe Area, Theme, i18n & Auth Providers
│   └── index.tsx                      # Mobile Foundation & Architecture Verification Screen
├── src/
│   ├── api/                           # Centralized HTTP & Auth Client
│   │   ├── client.ts                  # Fetch-based API client with timeout, auth, & token refresh
│   │   ├── auth.api.ts                # Login, register, refresh, getMe endpoints
│   │   └── types.ts                   # ApiError, HttpMethod, RequestOptions
│   ├── components/                    # Lightweight Native Design System
│   │   ├── Badge.tsx                  # Status badge chips
│   │   ├── Button.tsx                 # Accessible 48dp touch targets, Android ripple, loading state
│   │   ├── Card.tsx                   # Rounded cards with subtle elevation & borders
│   │   ├── Input.tsx                  # Form text inputs with labels, errors, & focus styling
│   │   ├── LoadingSpinner.tsx         # Pure ActivityIndicator wrappers
│   │   ├── ScreenContainer.tsx        # Safe area aware container with pull-to-refresh
│   │   ├── Typography.tsx             # Text component supporting Devanagari and Latin fonts
│   │   └── index.ts                   # Barrel export
│   ├── constants/
│   │   ├── config.ts                  # Environment base URLs, timeouts, package names
│   │   └── storageKeys.ts             # SecureStore key constants
│   ├── context/                       # Native React Context State (Zero Redux/Zustand overhead)
│   │   ├── AuthContext.tsx            # Session lifecycle, SecureStore restore, community switching
│   │   ├── LocalizationContext.tsx    # Active language state, language toggle, t() function
│   │   └── ThemeContext.tsx           # Design system tokens provider
│   ├── hooks/                         # Typed Custom Hooks
│   │   ├── useAuth.ts
│   │   ├── useLocalization.ts
│   │   └── useTheme.ts
│   ├── localization/
│   │   └── i18n.ts                    # Fast in-memory translation resolver reusing @apnasamaj/i18n
│   ├── services/
│   │   └── storage.service.ts         # Expo SecureStore wrapper with memory fallback
│   ├── tests/                         # Automated Unit & Regression Tests
│   │   ├── mocks/                     # Node runtime mocks for native APIs
│   │   │   ├── expo-secure-store.ts
│   │   │   └── react-native.ts
│   │   ├── mobile-foundation.test.ts  # 19 automated foundation tests
│   │   └── test-runner.ts             # Node test execution harness
│   ├── theme/                         # Reusable Design System Tokens
│   │   ├── borderRadius.ts            # 4pt to pill radius tokens
│   │   ├── colors.ts                  # Brand colors, surfaces, borders, semantic status colors
│   │   ├── shadows.ts                 # Android elevation (1-4) & iOS shadow tokens
│   │   ├── spacing.ts                 # 4pt grid system (0 to 48)
│   │   ├── typography.ts              # Font size, line height, weight, and Devanagari family tokens
│   │   └── index.ts                   # Unified theme export
│   └── index.ts                       # Module barrel export
├── assets/
│   └── images/                        # Icon, splash, and adaptive icon PNG placeholders
├── app.json                           # Expo & Android Application Configuration
├── babel.config.js                    # Babel configuration
├── metro.config.js                    # Monorepo-aware Metro bundler configuration
├── package.json                       # Mobile workspace package manifest
└── tsconfig.json                      # Strict TypeScript configuration
```

---

## 3. Files Created and Modified

### Files Created:
1. `apps/mobile/package.json` — Workspace manifest with Expo SDK 52 dependencies.
2. `apps/mobile/app.json` — Expo app metadata, Android package `com.apnasamaj.app`, adaptive icons.
3. `apps/mobile/tsconfig.json` — Strict React Native TypeScript configuration with `@/*` path mapping.
4. `apps/mobile/babel.config.js` — Babel preset for Expo.
5. `apps/mobile/metro.config.js` — Monorepo-aware Metro configuration watching root node_modules.
6. `apps/mobile/assets/images/icon.png` — App icon placeholder.
7. `apps/mobile/assets/images/splash.png` — Splash screen placeholder.
8. `apps/mobile/assets/images/adaptive-icon.png` — Android adaptive icon placeholder.
9. `apps/mobile/assets/images/favicon.png` — Web favicon placeholder.
10. `apps/mobile/src/theme/colors.ts` — Brand, surface, text, and semantic color tokens.
11. `apps/mobile/src/theme/typography.ts` — Accessible font sizes, weights, and Devanagari font families.
12. `apps/mobile/src/theme/spacing.ts` — 4pt layout grid tokens.
13. `apps/mobile/src/theme/borderRadius.ts` — Radius tokens (0, 4, 8, 12, 16, 9999).
14. `apps/mobile/src/theme/shadows.ts` — Hardware-accelerated Android elevation and iOS shadow tokens.
15. `apps/mobile/src/theme/index.ts` — Unified theme export.
16. `apps/mobile/src/constants/config.ts` — Smart platform default API URLs, timeout, and community slug.
17. `apps/mobile/src/constants/storageKeys.ts` — SecureStore key definitions.
18. `apps/mobile/src/services/storage.service.ts` — Expo SecureStore abstraction with memory fallback.
19. `apps/mobile/src/api/types.ts` — ApiError class, HttpMethod, and RequestOptions.
20. `apps/mobile/src/api/client.ts` — Pure fetch-based centralized API client with timeout and 401 refresh.
21. `apps/mobile/src/api/auth.api.ts` — Typed authentication endpoints matching backend contracts.
22. `apps/mobile/src/localization/i18n.ts` — Lightweight dictionary lookup reusing `@apnasamaj/i18n`.
23. `apps/mobile/src/context/LocalizationContext.tsx` — Language switching and persistence provider.
24. `apps/mobile/src/context/ThemeContext.tsx` — Design system tokens provider.
25. `apps/mobile/src/context/AuthContext.tsx` — Session lifecycle and community context provider.
26. `apps/mobile/src/hooks/useAuth.ts` — Convenience hook for authentication context.
27. `apps/mobile/src/hooks/useTheme.ts` — Convenience hook for theme tokens.
28. `apps/mobile/src/hooks/useLocalization.ts` — Convenience hook for localization.
29. `apps/mobile/src/components/Typography.tsx` — Accessible text primitive.
30. `apps/mobile/src/components/Button.tsx` — Accessible touch button with Android ripple.
31. `apps/mobile/src/components/Card.tsx` — Flat rounded card primitive.
32. `apps/mobile/src/components/Input.tsx` — Form text input with focus and error styling.
33. `apps/mobile/src/components/Badge.tsx` — Status badge chip primitive.
34. `apps/mobile/src/components/LoadingSpinner.tsx` — Centered ActivityIndicator primitive.
35. `apps/mobile/src/components/ScreenContainer.tsx` — Safe area aware container with pull-to-refresh.
36. `apps/mobile/src/components/index.ts` — Component barrel export.
37. `apps/mobile/src/index.ts` — Mobile package public exports.
38. `apps/mobile/app/_layout.tsx` — Root Expo Router stack layout.
39. `apps/mobile/app/index.tsx` — Mobile architecture foundation screen.
40. `apps/mobile/src/tests/mocks/react-native.ts` — Node test runtime mock for React Native.
41. `apps/mobile/src/tests/mocks/expo-secure-store.ts` — Node test runtime mock for SecureStore.
42. `apps/mobile/src/tests/mobile-foundation.test.ts` — 19 automated foundation tests.
43. `apps/mobile/src/tests/test-runner.ts` — Node test harness.
44. `docs/BATCH_1_MOBILE_FOUNDATION_REPORT.md` — Comprehensive batch report.

### Files Modified:
1. `apps/admin/src/pages/MatrimonialModerationPage.tsx` — Added missing `Stack` import from `@mui/material` so full monorepo typecheck and build pass cleanly.
2. `package-lock.json` — Updated lockfile with Expo SDK 52 mobile dependencies.

---

## 4. Dependencies Installed & Versions

| Package | Version | Justification |
|:---|:---|:---|
| `expo` | `~52.0.49` | Core Expo SDK runtime for cross-platform Android support. |
| `expo-router` | `~4.0.21` | File-based routing optimized for React Native. |
| `react` | `18.3.1` | Exactly matches React version used in `apps/web` and `apps/admin`. |
| `react-native` | `0.76.9` | Official React Native version required by Expo SDK 52.0.49. |
| `expo-secure-store` | `~14.0.1` | Hardware-backed encrypted storage (Android Keystore / iOS Keychain). |
| `react-native-safe-area-context` | `4.12.0` | Native inset handling for Android status bars and notches. |
| `react-native-screens` | `~4.4.0` | Native view controllers for memory-efficient screen transitions. |
| `react-native-gesture-handler` | `~2.20.2` | Native touch and gesture handling. |
| `expo-status-bar` | `~2.0.1` | Status bar theme synchronization. |
| `expo-constants` | `~17.0.7` | Access to app configuration and device metadata. |
| `expo-linking` | `~7.0.5` | Deep linking foundation for Expo Router. |
| `expo-asset` | `~11.0.4` | Metro asset bundler support. |
| `query-string` | `7.1.3` | Hermes-compatible query string parsing (avoids ES2024 regex incompatibility in v9). |

### Explicitly Excluded (Zero Bloat Policy):
- ❌ **NativeBase / React Native Paper / Tamagui:** Excluded to prevent heavy bundle sizes and excessive memory consumption on budget devices.
- ❌ **Redux / Zustand:** Excluded in favor of lightweight, native React Context.
- ❌ **Axios:** Excluded; replaced with a pure `fetch` client using native `AbortController`.
- ❌ **AsyncStorage:** Excluded for sensitive data; tokens are encrypted exclusively in `SecureStore`.

---

## 5. Expo SDK Version & Android Configuration

- **Expo SDK Version:** `52.0.0` (core package `52.0.49`).
- **Android Package Name:** `com.apnasamaj.app`.
- **Application Display Name:** `Apna Samaj` (अपना समाज).
- **Default Orientation:** `portrait`.
- **UI Mode:** `light` (clean white background `#F8FAFC`, card surface `#FFFFFF`).
- **Architecture:** React Native New Architecture enabled (`newArchEnabled: true`).
- **JS Engine:** Hermes bytecode compiler enabled by default.

---

## 6. API Integration Readiness

The centralized API client (`ApiClient` in `src/api/client.ts`) provides:
1. **Dynamic Environment Base URL:**
   - Android Emulator: `http://10.0.2.2:5000/api/v1` (routes to host machine).
   - iOS Simulator / Local Web: `http://localhost:5000/api/v1`.
   - Production / Remote: Overridable via `EXPO_PUBLIC_API_URL`.
2. **Multi-Tenant Context Injection:**
   - Every outgoing request automatically includes `x-community-slug` header, resolved from SecureStore.
3. **Authentication Bearer Header:**
   - Automatically attaches `Authorization: Bearer <accessToken>` from SecureStore.
4. **Standardized Timeout:**
   - 15-second default timeout via native `AbortController`, preventing hung connections on spotty 2G/3G networks.
5. **Concurrency-Safe Token Refresh:**
   - On HTTP 401 Unauthorized, an internal mutex intercepts queued requests, calls `POST /api/v1/auth/refresh` with `{ refreshToken }`, writes new tokens to SecureStore, and retries the original request seamlessly.
   - If session renewal fails, tokens are cleanly purged and the app transitions to guest state.

---

## 7. Authentication Security Approach

- **Zero Passwords in Storage:** Passwords are used strictly for network transmission during login/register and never persisted.
- **Hardware-Backed Encryption:** Tokens (`accessToken`, `refreshToken`, `communitySlug`) are stored exclusively in `expo-secure-store` using Android Keystore.
- **Zero Sensitive Data in AsyncStorage:** AsyncStorage is completely avoided for credentials.
- **Session Restoration on Launch:** `AuthProvider` checks SecureStore on app launch, verifies token validity against `GET /api/v1/auth/me`, and loads the user profile into memory.

---

## 8. Hindi and English Localization Readiness

- **Default Language:** Hindi (`hi`).
- **Secondary Language:** English (`en`).
- **Direct Resource Reuse:** `src/localization/i18n.ts` imports translation dictionaries directly from `packages/i18n/src/resources.ts`, ensuring 100% key parity with web and admin portals.
- **Lightweight Resolver:** Pure dictionary lookup with dot-notation support (`common:appName`, `auth:login`), fallback resolution, and parameter interpolation (`{{param}}`).
- **Language Switching & Persistence:** Managed via `LocalizationContext` and persisted in SecureStore.

---

## 9. Performance Optimization Decisions (Low-End Android)

1. **Pure React Native Primitives:** All components (`Typography`, `Button`, `Card`, `Input`, `Badge`, `LoadingSpinner`) use built-in React Native components (`View`, `Text`, `Pressable`, `TextInput`, `ActivityIndicator`).
2. **Accessible Touch Targets:** Buttons and inputs enforce a `minHeight: 48dp` touch target per Android Material Accessibility Guidelines.
3. **Hardware-Accelerated Feedback:** Buttons utilize native `android_ripple` overlays instead of heavy JavaScript opacity animations.
4. **Low GPU Elevation:** Shadows use Android native `elevation` (levels 1, 2, 4), avoiding costly blur computations.
5. **Tiny Hermes Bundle:** The entire compiled Android bundle is only **2.61 MB** (`entry-d22311dad87297e4427db7b92c98a3c3.hbc`).
6. **Zero Memory Leaks:** Unmount guards in `useEffect` across all contexts.

---

## 10. Typecheck and Verification Results

### A. Mobile Unit & Architecture Test Suite
Command: `npm test --workspace=@apnasamaj/mobile`  
Result: **19 / 19 PASS (100%)**

```text
================================================================
    Apna Samaj — Batch 1 Mobile Foundation Test Suite           
================================================================

--- 1. Expo & Android Configuration ---
✅ PASS: Expo app name is "Apna Samaj"
✅ PASS: Android package identifier is "com.apnasamaj.app"
✅ PASS: Expo orientation is portrait and light mode default
✅ PASS: Required Expo plugins are registered

--- 2. Design System Tokens ---
✅ PASS: Theme defines brand colors with clean white background and high contrast text
✅ PASS: Spacing tokens follow 4pt grid system
✅ PASS: Border radius tokens support subtle rounded cards and pills
✅ PASS: Shadow tokens define low elevation for Android hardware efficiency

--- 3. Storage Service & Security ---
✅ PASS: Storage service saves and retrieves tokens in memory fallback/keystore
✅ PASS: clearAuthTokens removes all sensitive tokens
✅ PASS: Storage service persists and restores community tenant slug

--- 4. Centralized API Client & Tenant Context ---
✅ PASS: API client initializes with configured base URL without trailing slashes
✅ PASS: buildUrl appends query parameters correctly
✅ PASS: buildHeaders injects tenant slug and Bearer token
✅ PASS: ApiError encapsulates HTTP status and payload

--- 5. Localization Foundation (Hindi + English) ---
✅ PASS: resolveTranslation defaults to Hindi resources
✅ PASS: resolveTranslation resolves English translations
✅ PASS: resolveTranslation resolves namespace-prefixed keys "ns:key"
✅ PASS: resolveTranslation performs parameter interpolation

================================================================
Summary: All 19 mobile foundation tests passed!
================================================================
```

### B. Expo Doctor Compatibility Checks
Command: `cd apps/mobile; npx expo-doctor`  
Result: **18 / 18 checks passed. No issues detected!**

### C. Android Hermes Bundling Export
Command: `cd apps/mobile; npx expo export --platform android`  
Result: **PASSED with 0 errors** (946 modules transformed, 2.61 MB Hermes `.hbc` bundle generated).

### D. Monorepo Full Typecheck
Command: `npm run typecheck`  
Result: **0 errors across all 9 workspaces** (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/mobile`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`).

### E. Existing Web & Admin Builds
1. `npm run build --workspace=@apnasamaj/admin` -> **PASSED** (Vite v5.4.21, 11613 modules, 0 errors).
2. `npm run build --workspace=@apnasamaj/web` -> **PASSED** (Vite v5.4.21, 11804 modules, 0 errors).

---

## 11. Android Run Instructions

To run the mobile app locally during development:

1. **Start the Backend API:**
   ```bash
   npm run dev:api
   ```
2. **Start the Expo Development Server:**
   ```bash
   cd apps/mobile
   npm start
   ```
3. **Launch on Android Emulator or Device:**
   - Press `a` in the Expo terminal to open on a running Android emulator.
   - Or scan the QR code using the **Expo Go** app on a physical Android device connected to the same Wi-Fi network.
4. **Environment Variables (Optional):**
   - Create `apps/mobile/.env` to customize the API URL:
     ```env
     EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:5000/api/v1
     EXPO_PUBLIC_DEFAULT_COMMUNITY_SLUG=demo
     ```

---

## 12. Confirmation that Existing Applications Were Not Affected

- **Backend API (`apps/api`):** No business logic, routes, middleware, or database queries were modified.
- **Database (`packages/database`):** No schema modifications or migrations were executed.
- **Web App (`apps/web`):** Build passes cleanly (`dist/index.html` generated, 0 errors).
- **Admin App (`apps/admin`):** Build passes cleanly (`dist/index.html` generated, 0 errors).
- **Existing Shared Packages:** `@apnasamaj/shared-types`, `@apnasamaj/validation`, `@apnasamaj/i18n`, and `@apnasamaj/ui-config` pass all typechecks.

---

## 13. Git Status Summary

- **Branch:** `main`
- **Initial HEAD:** `a4895ade19cc38a63db6f3c309480561ac17c58b`
- **Current Git Status:**
  ```text
  M apps/admin/src/pages/MatrimonialModerationPage.tsx
  M package-lock.json
  ?? apps/mobile/
  ?? docs/BATCH_1_MOBILE_FOUNDATION_REPORT.md
  ```
- **Strict Adherence to Safety Rules:** No `git add .`, no commits, no pushes, and no deployments executed. All changes remain staged in the local working tree ready for user inspection.

