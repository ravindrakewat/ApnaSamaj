# Apna Samaj — Batch 10.5: Production API Domain Migration (Mobile + Web) Report

**Generated Date:** November 18, 2026  
**Status:** ✅ Successfully Implemented & Verified  
**Execution Environment:** Windows 11 / Node v22.14.0 / PowerShell  
**Target Production Domain:** `https://api.samaz.in`  
**Live Endpoint Health Check:** Confirmed (`GET https://api.samaz.in/health` -> HTTP 200 `{"success":true,"message":"Apna Samaj API is healthy",...}`)

---

## 1. Old vs. New API Configuration

| Property | Old Render Legacy Configuration | New Verified Production Domain |
|:---|:---|:---|
| **API Base Origin** | `https://apnasamaj-api.onrender.com` | `https://api.samaz.in` |
| **API v1 Base Endpoint** | `https://apnasamaj-api.onrender.com/api/v1` | `https://api.samaz.in/api/v1` |
| **Health Check Endpoint** | `https://apnasamaj-api.onrender.com/health` | `https://api.samaz.in/health` |
| **Socket.IO Realtime Origin** | `https://apnasamaj-api.onrender.com` | `https://api.samaz.in` |
| **Socket.IO Handshake Path** | `/socket.io` | `/socket.io` |

---

## 2. Exact Files Modified & Created

### Modified:
1. [`apps/mobile/eas.json`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/mobile/eas.json)
   - Updated `build.preview.env.EXPO_PUBLIC_API_URL` to `https://api.samaz.in/api/v1`.
   - Added `build.production.env.EXPO_PUBLIC_API_URL` set to `https://api.samaz.in/api/v1`.
2. [`apps/mobile/src/constants/config.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/mobile/src/constants/config.ts)
   - Enhanced `resolveDefaultApiBaseUrl()` with path normalization (stripping trailing slash, ensuring `/api/v1` prefix).
   - Added standalone release / production fallback (`!isDev` -> `https://api.samaz.in/api/v1`).
   - Strictly preserved Android emulator (`10.0.2.2:4000`), physical device LAN (`hostUri`), and simulator dev fallbacks.
3. [`apps/mobile/.env.example`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/mobile/.env.example)
   - Added production/EAS configuration template documentation pointing to `https://api.samaz.in/api/v1`.
4. [`apps/web/src/config/api.config.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/web/src/config/api.config.ts)
   - Replaced static fallback with resilient `resolveApiBaseUrl()`.
   - Strips trailing slash and accidental `/api/v1` subpath from `VITE_API_URL` to maintain origin consistency for `${API_BASE_URL}/api/v1/...` and Socket.IO.
   - Automatically defaults to `https://api.samaz.in` when `import.meta.env.PROD` is true.
   - Preserves `http://localhost:4000` default in local development and Vitest/Node test runners.

### Created:
5. [`apps/web/.env.example`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/web/.env.example)
   - Created clear template documenting local dev `http://localhost:4000` and production `https://api.samaz.in`.
6. [`docs/BATCH_10_5_PRODUCTION_API_DOMAIN_MIGRATION_REPORT.md`](file:///c:/Users/HP/Downloads/dspromain/dspro58/docs/BATCH_10_5_PRODUCTION_API_DOMAIN_MIGRATION_REPORT.md)
   - Comprehensive batch forensic audit, test execution, and deployment verification record.

---

## 3. Mobile Configuration Changes

- **Centralized API Client Resolution:**
  All mobile HTTP requests route through `ApiClient` ([`apps/mobile/src/api/client.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/mobile/src/api/client.ts)), which binds to `APP_CONFIG.apiBaseUrl`.
- **EAS Build Profile Hardening:**
  Both `preview` (standalone internal APK builds) and `production` (Google Play Store AAB app-bundles) in `eas.json` now inject `EXPO_PUBLIC_API_URL: "https://api.samaz.in/api/v1"`.
- **Preservation of Local Workflows:**
  - Physical devices connecting via Metro over local Wi-Fi automatically resolve LAN IP from `Constants.expoConfig.hostUri`.
  - Android Emulators in dev mode resolve to loopback `10.0.2.2:4000/api/v1`.
  - iOS Simulators and Web development resolve to `localhost:4000/api/v1`.
- **Tenant Context & Auth Preservation:**
  The `x-community-slug` header, JWT bearer tokens, automatic 401 refresh token rotation, and multi-part media uploads remain intact with zero regressions.

---

## 4. Website Configuration Changes

- **Centralized API Resolution:**
  The Member Web Portal resolves API origin via `API_BASE_URL` ([`apps/web/src/config/api.config.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/web/src/config/api.config.ts)).
- **Production Build Automation:**
  Vite's production build compiler sets `import.meta.env.PROD = true`. When built for production, the compiled bundle automatically embeds `https://api.samaz.in` even if Vercel environment variables are temporarily unset.
- **Normalization Safeguard:**
  If an operator configures `VITE_API_URL="https://api.samaz.in/api/v1"` in Vercel, `resolveApiBaseUrl()` strips the `/api/v1` suffix so that downstream API service calls (which append `/api/v1/...`) do not generate duplicate paths.

---

## 5. Environment Variables Required for Vercel & EAS

| Target Platform | Variable Name | Recommended Value | Notes |
|:---|:---|:---|:---|
| **Vercel (`apps/web`)** | `VITE_API_URL` | `https://api.samaz.in` | Optional due to built-in `PROD` fallback in code, but recommended in Vercel Project Settings for explicit configuration. |
| **EAS Build (`apps/mobile`)** | `EXPO_PUBLIC_API_URL` | `https://api.samaz.in/api/v1` | Pre-configured in `eas.json` under `build.preview.env` and `build.production.env`. Can also be defined in EAS Secret variables. |
| **EAS Build (`apps/mobile`)** | `EXPO_PUBLIC_DEFAULT_COMMUNITY_SLUG` | `kewat` | Configured in `eas.json`. Controls default tenant bootstrap context. |

> [!IMPORTANT]
> Changing local environment files or code does **not** retroactively update an already-built APK on a user's phone or an existing static deployment on Vercel. A new EAS build and Vercel deployment will reflect these changes.

---

## 6. Socket.IO Configuration Status

1. **Mobile (`apps/mobile/src/services/socket.service.ts`):**
   - Strips `/api/v1` from `APP_CONFIG.apiBaseUrl` via `getSocketServerUrl()`.
   - Resolves to: `https://api.samaz.in`
   - Connects with path: `/socket.io`, `transports: ['websocket', 'polling']`.
2. **Website (`apps/web/src/services/chat.socket.ts`):**
   - Connects to: `API_BASE_URL` (`https://api.samaz.in`)
   - Path: `/socket.io`, `withCredentials: true`.
3. **Backend Server (`apps/api/src/modules/chat/chat.socket.ts`):**
   - Listens on `/socket.io`.
   - Validates origin through `isCorsOriginAllowed`.

---

## 7. CORS Compatibility Audit Findings

A forensic audit of [`apps/api/src/config/cors.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/api/src/config/cors.ts) and [`apps/api/src/app.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/api/src/app.ts) was conducted:
- **`https://samaz.in`** is explicitly approved in `APPROVED_APNA_SAMAJ_ORIGINS` (line 13).
- **`https://www.samaz.in`** is explicitly approved in `APPROVED_APNA_SAMAJ_ORIGINS` (line 14).
- Subdomains matching `*.samaz.in` (including `kewat.samaz.in`, `gupta.samaz.in`, `api.samaz.in`) are approved over HTTPS (lines 60-61).
- **Vercel Deployments:** `apna-samaj.vercel.app`, `apna-samaj-admin.vercel.app`, and project branch previews (`apna-samaj-*.vercel.app`) are approved (lines 74-83).
- **Mobile Apps:** React Native / Expo fetch and WebSocket requests omit the browser `Origin` header. `isCorsOriginAllowed` explicitly permits requests with no origin (`if (!origin) return true;` at line 38).
- **CORS Changes Required:** **None.** The backend already fully supports `samaz.in`, `www.samaz.in`, all community subdomains, Vercel origins, and mobile applications.

---

## 8. Test and Build Results

| Check / Test Suite | Command | Result | Details |
|:---|:---|:---:|:---|
| **Mobile Typecheck** | `npm run typecheck -w @apnasamaj/mobile` | ✅ **PASS** | 0 TypeScript errors. Clean AST compilation. |
| **Web Typecheck** | `npm run typecheck -w @apnasamaj/web` | ✅ **PASS** | 0 TypeScript errors. Clean AST compilation. |
| **Mobile Foundation & Auth Tests** | `npm -w @apnasamaj/mobile test` | ✅ **PASS** | All test suites passed cleanly (Auth, Storage, API Client, Push Notifications, YouTube previews). |
| **Web Appeals Experience Tests** | `npx tsx apps/web/src/tests/appeals-experience.test.ts` | ✅ **PASS** | 11 passed, 0 failed. |
| **Web Notifications Tests** | `npx tsx apps/web/src/tests/notifications-experience.test.ts` | ✅ **PASS** | 37 passed, 0 failed. |
| **Web Groups UX Tests** | `npx tsx apps/web/src/tests/groups-frontend-ux.test.ts` | ✅ **PASS** | 57 passed, 0 failed. |
| **Web Production Build** | `npm run build -w @apnasamaj/web` | ✅ **PASS** | Vite built in 17.82s. Dist assets generated cleanly. |
| **Bundle URL Verification** | `node scratch/verify-migration.js` | ✅ **PASS** | Compiled web bundle contains `https://api.samaz.in` and 0 occurrences of `render.com`. EAS json contains `https://api.samaz.in/api/v1`. |

---

## 9. Remaining Manual Deployment Steps (For User)

When ready to deploy (do not execute automatically):

1. **Website (Vercel):**
   - Commit and push changes to `main` (Vercel will trigger a new deployment of `apps/web`).
   - Optionally set `VITE_API_URL=https://api.samaz.in` in the Vercel Project Settings -> Environment Variables.
2. **Mobile Application (EAS Build):**
   - Run `eas build --profile preview --platform android` to generate a new standalone preview APK pointing directly to `https://api.samaz.in/api/v1`.
3. **DNS Recommendation (from previous investigation):**
   - In GoDaddy DNS settings, update the apex `samaz.in` `A` record from GoDaddy parking IP `216.198.79.1` to Vercel's Anycast IP `76.76.21.21` so `https://samaz.in` routes to the website.

---

## 10. Blockers

- **None.** All code modifications, fallback logic, environment templates, and build verifications are complete and passing.
