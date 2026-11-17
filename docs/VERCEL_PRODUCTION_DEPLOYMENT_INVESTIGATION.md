# Apna Samaj — Vercel Production Website Deployment Investigation Report

**Investigation Date:** November 18, 2026  
**Investigated Target:** `https://samaz.in/lander` & `https://www.samaz.in`  
**Reference Git Commits:** `8f5ec42` (Reported Production Baseline) / `45e3d5b` (Current `main` & `origin/main`)  
**Scope:** Read-Only Forensic Audit across Vercel Deployment, Monorepo Packages, DNS Resolution, and Routing Architecture.

---

## Executive Summary

The investigation revealed **two primary root causes** for why `https://samaz.in/lander` is not displaying the expected latest changes:

1. **DNS Apex Record Pointing to GoDaddy Parking (`/lander` is a GoDaddy Parking Page, NOT Apna Samaj):**
   - The apex domain `samaz.in` has an `A` record in GoDaddy DNS pointing to `216.198.79.1` (GoDaddy's Parked Domain IP).
   - When visiting `https://samaz.in`, GoDaddy's edge proxy (`Server: openresty`) intercepts the request and serves GoDaddy's own domain parking lander script (`https://img1.wsimg.com/parking-lander/static/js/main.1cc9fa89.js`) with path `/lander`.
   - The path `/lander` **does not exist anywhere** in the Apna Samaj codebase or git history.
   - Meanwhile, `www.samaz.in` correctly points to Vercel via CNAME `a8c5b4cd9b09a941.vercel-dns-017.com` and serves the actual Apna Samaj Web application.

2. **Feature Scope Mismatch (`apps/mobile` vs `apps/web`):**
   - All recent feature development across the last 30+ batches (Batches 1 through 10.3.2) was implemented exclusively in **`apps/mobile`** (React Native + Expo SDK 52) and **`apps/api`** (Backend).
   - Zero lines of code have been committed to **`apps/web`** since commit `a4895ad` (Batch 15I.2).
   - Vercel's `apna-samaj` project deploys `apps/web` (Vite + React 18). Because `apps/web` has not received the mobile app's redesigns (such as the new post composer, YouTube link preview in chat, employment portal, matrimonial wizard), the deployed web portal displays its existing Batch 15I.2 UI.

---

## 1. Vercel Configuration Audit

| Configuration Field | Inspected Setting | Source / Verification Method |
|:---|:---|:---|
| **Vercel Project Name** | `apna-samaj` | Vercel origin headers (`X-Vercel-Id`) & Project History |
| **Monorepo Root Directory** | `apps/web` | `apps/web/package.json` (`@apnasamaj/web`), `apps/web/vercel.json` |
| **Framework Preset** | `Vite` (React 18 + TypeScript) | `apps/web/vite.config.ts`, `apps/web/package.json` |
| **Build Command** | `tsc && vite build` (`npm run build`) | `apps/web/package.json` line 9 |
| **Output Directory** | `dist` | Default Vite build output directory |
| **Production Branch** | `main` | Confirmed by live deployment triggers on push |
| **Vercel Rewrites/Redirects** | `{"source": "/(.*)", "destination": "/index.html"}` | `apps/web/vercel.json` (SPA client-side catch-all) |
| **Environment Variable Names** | `VITE_API_URL` | `apps/web/src/config/api.config.ts` line 5 |

*Note: In accordance with security guidelines, environment variable values were not inspected or logged.*

---

## 2. Monorepo Verification

The Apna Samaj monorepo contains 4 distinct application targets under `apps/`:

```text
apps/
├── web/       # Member Portal (Vite + React 18 SPA) -> Deployed to Vercel project "apna-samaj" (samaz.in)
├── admin/     # Admin Portal (Vite + React 18 SPA) -> Deployed to Vercel project "apna-samaj-admin" (admin.samaz.in)
├── mobile/    # Mobile Application (React Native + Expo SDK 52) -> Packaged via EAS Build for Android APK / iOS
└── api/       # Core REST & WebSocket API (Express + TypeScript) -> Deployed to Render (apnasamaj-api.onrender.com)
```

### Deployed Application Confirmation
- HTTP probe against `https://apna-samaj.vercel.app/` and `https://www.samaz.in/`:
  - Returns `<title>Apna Samaj — Community Portal</title>`
  - Loads `/assets/index-BQ9QYu9_.js` (size: 719,892 bytes)
  - String analysis of the deployed JavaScript bundle confirms:
    - `Has "Apna Samaj": true`
    - `Has "MemberProfile": true`
    - `Has "claim-account": true`
    - `Has "matrimonial/me": true`
    - `Has "AuditLogsPage" (admin): false`
    - `Has "Admin Management" (admin): false`
- **Conclusion:** The Vercel project `apna-samaj` is deploying **`apps/web`** exclusively. It is not deploying `apps/admin` or `apps/mobile`.

---

## 3. Git Verification & Commit Alignment

### Git State Comparison
- **Local `main`:** `45e3d5b`
- **Remote `origin/main`:** `45e3d5b` (Fully synchronized)
- **Reported Deployment Commit:** `8f5ec42`

### Commit History Audit of `apps/web`
We executed a git log audit specifically scoped to `apps/web`:
```bash
git log a4895ad..HEAD --stat -- apps/web
# Result: 0 commits (Empty output)
```

The last 10 commits to touch `apps/web` were:
1. `a4895ad` — `feat(matrimonial): complete matrimonial moderation, verification system...`
2. `3ed38e5` — `fix(feed): resolve post image upload failure, add composer retry ux...`
3. `b114d26` — `feat(i18n): localize member directory, community groups, and matrimonial modules...`
4. `e02c6f2` — `feat(feed): implement post title and structured content...`
5. `247fb6d` — `feat(feed): social feed hindi/english localization...`
6. `ae2fe5e` — `feat(import): excel bulk member import and self-service account claim flow...`
7. `eb3e639` — `feat(matrimonial): fix card image rendering with primaryPhotoUrl...`
8. `cb35183` — `feat(i18n): implement shared multilingual foundation, language selector...`
9. `4e7e615` — `feat(feed): implement frontend search, 300ms debouncing, url synchronization...`
10. `20eba1c` — `feat(web): localize navbar navigation labels to Hindi`

### Finding
All development from commit `0f209e9` (Batch 1 Mobile) through `8f5ec42` / `45e3d5b` (Batch 10.3.2) was focused on **`apps/mobile`** and **`apps/api`**. There are no "missing" website commits in git; `apps/web` simply has not had changes made to it during the mobile development sprint.

Furthermore, Vercel **did** deploy the repository upon pushes to `main`. Inspection of `https://apna-samaj.vercel.app` shows a live `Last-Modified` timestamp matching the latest push (`Tue, 17 Nov 2026 19:08:22 GMT`).

---

## 4. Lander Route Investigation

### 4.1 Codebase Search
We executed recursive case-insensitive searches across the entire repository and complete git commit history:
```bash
git grep -i "lander"
# Result: 0 matches

git log --all -S "lander"
# Result: 0 commits
```
There is **no component, page, asset, or route** named `lander` anywhere in the project.

### 4.2 Website Router Implementation (`apps/web/src/App.tsx`)
The React Router route definitions in `apps/web/src/App.tsx` (lines 52–148) cover:
- `/` (`HomePage`)
- `/login` (`LoginPage`)
- `/register` (`RegisterPage`)
- `/forgot-password` (`ForgotPasswordPage`)
- `/reset-password` (`ResetPasswordPage`)
- `/claim-account` (`ClaimAccountPage`)
- `/profile` (`ProfilePage`)
- `/feed` (`FeedPage`)
- `/posts/:postId` (`PostDetailPage`)
- `/appeals` (`MyAppealsPage`)
- `/directory` (`DirectoryPage`)
- `/groups` (`GroupsPage`)
- `/groups/:slug` (`GroupDetailPage`)
- `/members/:id` (`MemberProfilePage`)
- `/matrimonial` (`MatrimonialDiscoveryPage`)
- `/matrimonial/profiles/:id` (`MatrimonialProfileDetailPage`)
- `/matrimonial/me` (`MatrimonialDashboardPage`)
- `*` (Catch-all: `<Route path="*" element={<Navigate to="/" replace />} />`)

When a user visits `/lander` on a properly routed Vercel deployment (e.g., `https://www.samaz.in/lander` or `https://apna-samaj.vercel.app/lander`):
- Vercel's rewrite in `apps/web/vercel.json` serves `index.html`.
- React Router matches `/lander` to the catch-all `*` and client-side redirects to `/` (`HomePage`).

### 4.3 Why is `https://samaz.in/lander` Serving a Different Page?
Direct HTTP probe of `https://samaz.in/lander`:
```http
HTTP/1.1 200 OK
Server: openresty
Cache-Control: private, max-age=60
Set-Cookie: traffic_target=gd; lander_type=parkweb; ...
```
HTML Payload:
```html
<!doctype html>
<html lang="en">
<head>
  <script>window.LANDER_SYSTEM="PW"</script>
  <script>window._trfd=window._trfd||[],window._trfd.push({ap:"parking"})</script>
  <script async src="https://img1.wsimg.com/signals/js/clients/scc-c2/scc-c2.min.js"></script>
  <script defer="defer" src="https://img1.wsimg.com/parking-lander/static/js/main.1cc9fa89.js"></script>
  <link href="https://img1.wsimg.com/parking-lander/static/css/main.4276ff80.css" rel="stylesheet">
</head>
<body><div id="root"></div></body>
</html>
```

Key observations:
- `LANDER_SYSTEM="PW"` (ParkWeb)
- `wsimg.com` is GoDaddy's static asset CDN.
- `traffic_target=gd` (GoDaddy).
- `Server: openresty` (GoDaddy's parking proxy, not Vercel).

---

## 5. DNS Root Cause Analysis

We performed authoritative DNS lookups across Google DNS (`8.8.8.8`), Cloudflare (`1.1.1.1`), OpenDNS (`208.67.222.222`), and GoDaddy Authoritative Nameservers (`ns37.domaincontrol.com` / `ns38.domaincontrol.com`):

```text
Query: samaz.in (Apex domain)
Authoritative NS: ns37.domaincontrol.com (97.74.108.19)
Record Type: A
Result: 216.198.79.1  <--- GODADDY DEFAULT DOMAIN PARKING IP

Query: www.samaz.in (Subdomain)
Authoritative NS: ns37.domaincontrol.com (97.74.108.19)
Record Type: CNAME
Result: a8c5b4cd9b09a941.vercel-dns-017.com  <--- VERCEL MANAGED CNAME
```

### Analysis
1. In GoDaddy DNS management for `samaz.in`, the `CNAME` for `www` was configured to point to Vercel.
2. However, the root `@` (`samaz.in`) `A` record was **left pointing to GoDaddy's default parking IP (`216.198.79.1`)**.
3. When a user navigates to `https://samaz.in`:
   - DNS resolves to GoDaddy's parking server (`216.198.79.1`).
   - GoDaddy serves its commercial parked domain lander (`/lander`).
   - The user sees GoDaddy's parking lander and assumes the website deployment is stale or failing.
4. When a user navigates to `https://www.samaz.in`:
   - DNS resolves to Vercel edge (`64.29.17.65` / `216.198.79.65`).
   - Vercel serves the Apna Samaj Web application (`apps/web`).

---

## 6. Summary of Findings

| Question | Investigation Finding |
|:---|:---|
| **What application is deployed by `apna-samaj` on Vercel?** | `apps/web` (`@apnasamaj/web`, Member Portal). |
| **What is the Root Directory on Vercel?** | `apps/web` |
| **What is the latest deployed commit?** | Commits to `main` auto-deploy to Vercel. Latest push `45e3d5b` deployed successfully. |
| **Are the latest Web changes included?** | Yes. All committed code in `apps/web` is deployed. However, no new commits have been made to `apps/web` since `a4895ad`; recent sprint batches were mobile-only. |
| **What component is served at `/lander`?** | In the Apna Samaj app, `/lander` redirects to `/` via React Router catch-all. On `samaz.in`, it serves GoDaddy's domain parking template. |
| **Why is `https://samaz.in/lander` stale/broken?** | The apex domain `@` in GoDaddy DNS points to GoDaddy's parking IP (`216.198.79.1`) instead of Vercel (`76.76.21.21`). |

---

## 7. Recommended Corrective Steps (For User Review)

> [!IMPORTANT]
> In accordance with instructions, no changes were implemented during this investigation. The following steps are recommendations for the administrator.

### Step 1: Fix Apex DNS Record in GoDaddy
1. Log in to the **GoDaddy DNS Management Console** for `samaz.in`.
2. Locate the `A` record for `@` (currently pointing to `216.198.79.1`).
3. Update the `A` record value to Vercel's official Anycast IP:
   - **Type:** `A`
   - **Name:** `@`
   - **Value:** `76.76.21.21`
   - **TTL:** 600 seconds (or 1/2 hour)
4. Delete any conflicting GoDaddy domain parking forwarding or lander rules.

### Step 2: Verify Domains in Vercel Project Settings
1. Open the **Vercel Dashboard** -> Project `apna-samaj` -> **Settings** -> **Domains**.
2. Ensure both domains are present:
   - `samaz.in` (configured to redirect to `www.samaz.in`, or set as canonical)
   - `www.samaz.in` (points to CNAME `cname.vercel-dns.com` or project CNAME)
3. Wait for DNS propagation (typically 5 to 30 minutes).

### Step 3: Access the Live Website Directly
To immediately verify the deployed Apna Samaj website without waiting for GoDaddy apex DNS propagation, use:
- **`https://www.samaz.in/`** (already points to Vercel)
- **`https://apna-samaj.vercel.app/`** (direct Vercel deployment URL)

### Step 4: Web Feature Parity Sprint (If Mobile Features are Expected on Web)
If the user expects the mobile features (Batch 10 composer redesign, in-app YouTube link previews, chat modules, matrimonial wizard, schemes, employment) to appear on the desktop website, those features need to be ported from `apps/mobile` into `apps/web` in a dedicated batch sprint.
