# Apna Samaj — Persistent Project History & Engineering Memory

> **Notice for AI Assistants & Engineers:** This document is the single source of truth for repository history, architecture invariants, verified commits, multi-tenant safety rules, completed batches, and in-flight work. **Always read this document at the start of any new session or when continuing on a different machine.**

---

## A. Project Identity

- **Project Name:** Apna Samaj (Community Platform)
- **Primary Repository:** `ravindrakewat/ApnaSamaj`
- **Remote Origin URL:** `https://github.com/ravindrakewat/ApnaSamaj.git`
- **Primary Branch:** `main`
- **Monorepo Architecture:** npm workspaces monorepo with 7 packages/apps:
  ```text
  ├── apps/
  │   ├── web/           # Member Portal (React 18 + Vite + TypeScript + Material UI)
  │   ├── admin/         # Admin Management Portal (React 18 + Vite + TypeScript + Material UI)
  │   ├── api/           # Core Backend Service (Node.js + Express + TypeScript)
  │   └── mobile/        # [Reserved] React Native Mobile App
  └── packages/
      ├── database/      # Prisma Schema & Client Export (PostgreSQL)
      ├── shared-types/  # Universal TypeScript Models & DTO Interfaces
      ├── validation/    # Shared Zod Schemas for API Contracts & Forms
      └── ui-config/     # Shared Material UI Themes & Styling Tokens
  ```
- **Backend Stack:** Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Argon2id, Zod, Supertest.
- **Frontend Stack:** React 18, Vite, TypeScript, Material UI (MUI) v5, Lucide React, Emotion, Vitest.
- **Database & Hosting Roles:**
  - **Supabase:** Managed physical PostgreSQL databases for multi-tenant community instances.
  - **GitHub (`ravindrakewat/ApnaSamaj`):** Authoritative source repository, branch protection, CI/CD trigger.
  - **Vercel:** Frontend hosting for `apps/web` (Member Portal) and `apps/admin` (Admin Management Portal). Automatically builds and deploys on push to `main` according to configured root directories and build settings.
  - **Render:** Backend API hosting for `apps/api` (Web Service). Automatically builds and deploys on push to `main`.
- **Multi-Tenant Architecture:**
  - Physical database-per-community isolation model.
  - Incoming requests supply tenant identity via `x-community-slug` header, subdomain, or request body.
  - Tenant resolution middleware authenticates the tenant and binds a scoped Prisma client to `req.db`.
  - Application handlers strictly use `assertDb(req.db)`. No shared single-table tenant multiplexing for core entities.

---

## B. Confirmed Git History

The following milestone checkpoint commits have been independently inspected in the repository's Git history and confirmed:

| Short Hash | Full Commit SHA | Commit Summary | Batch Scope | Verified In Git | Pushed to GitHub (`origin/main`) |
|:---|:---|:---|:---|:---:|:---:|
| `f7ac1b5` | `f7ac1b519749487ce9011b0be2ab689a8dcdea06` | `feat(staging): local postgres staging environment, appeals e2e verification, and batch 14o/14p reports` | Batch 14P.1 | **Confirmed** | **Confirmed** |
| `eb82c0d` | `eb82c0dc43e436282c618e1d6deee18ded3bcdc3` | `feat(auth): member self-service password reset, staging e2e verification, and batch 15a reports` | Batch 15A.6 | **Confirmed** | **Confirmed** |
| `ac336d4` | `ac336d45b2cb3201216fb473d9c4cf5640c59189` | `feat(directory): member directory query bounds, sub-caste filter, uuid validation, and staging e2e verification` | Batch 15B.4 | **Confirmed** | **Confirmed** |
| `5db254b` | `5db254bb8de727e542f58908f0fb18092f7fa881` | `feat(directory): member directory frontend sub-caste filter, url sync, debouncing, and ux verification` | Batch 15B.8 | **Confirmed** | **Confirmed** |
| `85c0570` | `85c0570a33b3fc23a1b848fd7f2d66e0752d313b` | `feat(groups): complete community groups module with security hardening and frontend UX` | Batch 15C.7 | **Confirmed** | **Confirmed** |
| `ea0629c` | `ea0629cf3f2bd65cdace1d5f5d302fcd2cfb5e67` | `feat(feed): harden post route parameter validation, add keyword search, and establish persistent project memory` | Batch 15D.4 | **Confirmed** | **Confirmed** |
| `2af6d8f` | `2af6d8ff04e57e9306b83f3e1bf24933a39e763b` | `fix(build): ensure types, prisma generation, and test exclusion for render production build` | Batch 15E.1 | **Confirmed** | **Confirmed** |
| `fd6fb0e` | `fd6fb0ef0d19f5a770020bf051c2017c6b986b45` | `fix(deps): promote typescript type definitions to root production dependencies and update lockfile` | Batch 15E.2 | **Confirmed** | **Confirmed** |
| `20eba1c` | `20eba1c7e2c54ab80dd300508811670dd1177f9d` | `feat(web): localize navbar navigation labels to Hindi` | Navbar i18n | **Confirmed** | **Confirmed** |

### Current HEAD & Remote Synchronization:
- **Active Branch:** `main`
- **Current HEAD:** `20eba1c7e2c54ab80dd300508811670dd1177f9d` (`20eba1c`)
- **Remote Tracking Reference:** `origin/main` (`https://github.com/ravindrakewat/ApnaSamaj.git`)
- **Upstream Sync Status:** Synchronized. `main` is directly at `origin/main` (0 commits ahead, 0 commits behind). Commit `20eba1c` and all prior checkpoints are verified present on the GitHub remote.

---

## C. Completed Feature Modules

### 1. Authentication & Member Self-Service Password Reset (Committed: `eb82c0d`)
- **Status:** **Implemented & Fully Verified**
- **Capabilities:**
  - Phone-based / identifier-based self-service password reset flow.
  - Cryptographically secure 32-byte hex reset token generation with SHA-256 token hashing at rest.
  - Strict 15-minute token TTL with single-use consumption and atomic invalidation.
  - Argon2id password hashing algorithm with strict complexity rules (min 8 chars, uppercase, lowercase, number, special char).
  - Anti-enumeration protection returning uniform generic success messages for non-existent and valid phone numbers alike.
  - Multi-tier rate limiting: IP rate limiter (20 req / 15 min), phone rate limiter (5 req / 15 min), preflight validation limiter, reset submission limiter.
  - Tenant-scoped user lookup and token storage executing exclusively within the resolved tenant database.
  - Frontend multi-step modal (`ForgotPasswordModal.tsx`, `ResetPasswordModal.tsx`, `PasswordStrengthIndicator.tsx`).

### 2. Member Directory (Committed: `ac336d4` & `5db254b`)
- **Status:** **Implemented & Fully Verified**
- **Capabilities:**
  - Bounded pagination (`limit` capped at 50, default 20) preventing bulk data scraping.
  - RFC 4122 UUID route parameter validation on `:id` profile endpoints returning HTTP 400 Bad Request on malformed inputs.
  - Case-insensitive search on full name, profession, and native place.
  - Case-insensitive sub-caste filtering (`subCaste` query parameter) integrated into Prisma `where` clause.
  - Privacy-preserving member projection: sensitive contact details, auth tokens, and password hashes are strictly omitted.
  - Frontend `DirectoryPage.tsx` with two-way URL query synchronization (`useSearchParams`), 300ms search debouncing, sub-caste dropdown, grid/list view toggle, and responsive cards.

### 3. Community Groups Module (Committed: `85c0570`)
- **Status:** **Implemented & Fully Verified**
- **Capabilities:**
  - Group lifecycle: Create, read, update, archive/delete with privacy modes (`PUBLIC`, `PRIVATE`, `SECRET`).
  - Membership lifecycle: Join public groups, request to join private groups, review/approve/reject join requests, leave group, member role management (`MEMBER`, `MODERATOR`, `ADMIN`).
  - Owner protection: Group creator cannot be removed or demoted without explicit ownership transfer.
  - Member roster pagination, role-based filtering, and member name search.
  - Strict UUID route parameter validation across group routes and chat integration routes.
  - Concurrency safety: atomic database operations and unique constraint guards preventing race conditions during simultaneous join requests or role updates.
  - Frontend `GroupsPage.tsx` and `GroupDetailPage.tsx` featuring tabbed views, member rosters, join request management, settings dialogs, role promotion/demotion, and deep linking.

### 4. Moderation Appeals Module (Committed: `815b535` / `f7ac1b5`)
- **Status:** **Implemented & Fully Verified**
- **Capabilities:**
  - Member-facing appeal submission for moderated posts, comments, or account suspensions.
  - Admin appeal review workflow with status transitions (`PENDING`, `APPROVED`, `REJECTED`).
  - Controlled staging environment testing with isolated local PostgreSQL database.

### 5. Social Feed & Posts Module (Committed: `ea0629c`; Frontend Refined: Batch 15D.5)
- **Status:** **Backend Hardened & Frontend Refined**
- **Implemented Architecture & Backend Hardening (`ea0629c`):**
  - Post models supporting multiple types: `GENERAL`, `ANNOUNCEMENT`, `EVENT`, `ACHIEVEMENT`, `MATRIMONIAL`.
  - Rich media attachments (`PostMedia`): images, direct video, YouTube embeds.
  - Social interactions: likes, views with deduplication, comments, post pins, post reporting.
  - Multi-tenant physical scoping on all feed queries.
  - Group post scoping: posts in private groups are strictly hidden from non-members.
  - RFC 4122 UUID parameter validation (`postIdSchema`, `postCommentIdSchema`) across all 15 post routes in `posts.controller.ts`.
  - Bounded keyword search parameter (`search` max 100 chars) in `feedQuerySchema` and `getCommunityFeed`.
  - Private group privacy invariants under `where.AND = [privacyFilter, searchFilter]`.
- **Batch 15D.5 Frontend Refinements (Working Tree):**
  - Search input bar at top of `FeedPage.tsx` with placeholder `समाज की पोस्ट खोजें...`.
  - 100-character input clamping and whitespace trimming.
  - 300ms debounced execution preventing excessive API invocations.
  - Clear-search button with immediate state reset.
  - Two-way URL synchronization (`useSearchParams`) for `search`, `type`, and `page` parameters.
  - Robust browser back/forward navigation support avoiding re-render loops.
  - Pagination reset to page 1 upon search query or post-type filter change.
  - Friendly Hindi empty state messages and clear/reset actions.
  - Request cancellation (`AbortController`) and stale response protection (`requestIdRef`).
  - 27 automated tests passing in `apps/web/src/tests/social-feed-frontend-ux.test.ts`.

---

## D. Multi-Tenant Safety Rules

These rules are non-negotiable architectural invariants for the Apna Samaj platform. Any code modification violating these rules must be rejected:

1. **Explicit Tenant Context Required:** Every request accessing community data must identify the community tenant (via `x-community-slug` header, subdomain, or explicit parameter).
2. **Use the Resolved Tenant Database:** All database operations must execute against `req.db` (the resolved Prisma client for the active tenant). Services and controllers must guard this with `assertDb(req.db)`.
3. **No Default or Fallback Tenant Database:** Never silently fall back to a central, default, or fallback database when tenant resolution fails. Missing or invalid tenant context must fail closed immediately with HTTP 400 or HTTP 404.
4. **SUPER_ADMIN Scoping Boundary:** While a `SUPER_ADMIN` user has elevated privileges, they must **never** bypass physical tenant database isolation. When performing operations within a community, their actions must still resolve and bind strictly to that specific community's database.
5. **Private Group Visibility:** Posts and membership rosters of private or secret groups must be visible exclusively to active, confirmed members of that group. Unauthenticated users or non-members must receive empty sets or 403/404 responses.
6. **Zero Sensitive Data Exposure:** Never expose sensitive fields in API responses. This includes:
   - Argon2id password hashes (`password`)
   - Reset tokens or verification hashes (`resetToken`, `tokenHash`)
   - Unverified member phone numbers or personal emails
   - Internal database connection strings or secret keys
7. **Database Safety & Migration Invariants:** Never run production migrations (`prisma migrate deploy`) or write destructive commands against production Supabase instances without explicit user authorization, verified backups, and dry runs in local staging.

---

## E. Batch History

| Batch ID | Objective | Implementation Summary | Key Report | Test Results | Commit | Push Status | Notes / Limitations |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **14N** | Production Readiness Audit | Assessed production readiness across security, multi-tenancy, and database configurations. | `BATCH_14N_PRODUCTION_READINESS_AUDIT.md` | Reported | `88ce7b8` | Pushed | Identified need for migration dry runs and backup verification. |
| **14O.1** | Migration Safety Review | Evaluated migration scripts for destructive operations or table locks. | `BATCH_14O_1_MIGRATION_SAFETY_REVIEW.md` | Reported | `88ce7b8` | Pushed | Established migration safety checklists. |
| **14O.2A–2C** | Backup Verification & Reports | Created local backup tooling and verified database dumps. | `BATCH_14O_2A_BACKUP_VERIFICATION.md`, `BATCH_14O_2C_LOCAL_BACKUP_REPORT.md` | Reported | `88ce7b8` | Pushed | Staging isolation confirmed. |
| **14O.3–7** | Staging Setup & Appeals E2E | Configured isolated local PostgreSQL staging environment and verified Appeals E2E tests. | `BATCH_14O_6_STAGING_SETUP_EXECUTION_REPORT.md`, `BATCH_14O_7_APPEALS_E2E_TEST_REPORT.md` | Verified Pass | `f7ac1b5` | Pushed | Confirmed zero writes to production Supabase. |
| **14P.1** | Final Git Checkpoint Review | Comprehensive pre-commit audit and safety sign-off for Batch 14 work. | `BATCH_14P_1_FINAL_GIT_CHECKPOINT_REVIEW.md` | Verified Pass | `f7ac1b5` | Pushed | Checkpoint commit `f7ac1b5` created and pushed. |
| **15A.1–4** | Password Reset Implementation | Backend hardening, rate limiting, anti-enumeration, Argon2id, and React frontend modal. | `BATCH_15A_2_PASSWORD_RESET_BACKEND_REPORT.md`, `BATCH_15A_4_PASSWORD_RESET_E2E_SECURITY_REPORT.md` | Verified Pass (25/25) | `eb82c0d` | Pushed | E2E staging tests verified anti-enumeration & rate limiting. |
| **15A.5–6** | Auth Git Audit & Checkpoint | Audited 24 candidate files, checked secrets, created local checkpoint commit. | `BATCH_15A_5_GIT_SAFETY_AUDIT_REPORT.md`, `BATCH_15A_6_CHECKPOINT_REPORT.md` | Verified Pass | `eb82c0d` | Pushed | Checkpoint commit `eb82c0d` created and pushed. |
| **15B.1–4** | Member Directory Backend | Query bounds (`limit` 50), sub-caste filter, UUID validation, and staging E2E tests. | `BATCH_15B_2_MEMBER_DIRECTORY_HARDENING_REPORT.md`, `BATCH_15B_4_CHECKPOINT_REPORT.md` | Verified Pass (28/28) | `ac336d4` | Pushed | Checkpoint commit `ac336d4` created and pushed. |
| **15B.5–8** | Member Directory Frontend | Sub-caste filter dropdown, two-way URL sync, 300ms debouncing, UX tests. | `BATCH_15B_6_MEMBER_DIRECTORY_FRONTEND_IMPLEMENTATION_REPORT.md`, `BATCH_15B_8_CHECKPOINT_REPORT.md` | Verified Pass (29/29) | `5db254b` | Pushed | Checkpoint commit `5db254b` created and pushed. |
| **15B.9** | Directory Integration Review | Post-commit regression and integration review for Member Directory. | `BATCH_15B_9_MEMBER_DIRECTORY_INTEGRATION_REVIEW.md` | Verified Pass | Untracked report | Pushed code in `5db254b` | Report left untracked during 15C.7 allowlist staging. |
| **15C.1–6** | Community Groups Module | Full backend hardening, UUID guards, membership lifecycle, frontend tabs, roster management. | `BATCH_15C_1_GROUPS_ARCHITECTURE_AUDIT.md`, `BATCH_15C_6_GROUPS_CHECKPOINT_SAFETY_REPORT.md` | Verified Pass (45/45) | `85c0570` | Pushed | 17 files staged via explicit allowlist in 15C.7. |
| **15C.7** | Groups Checkpoint Commit | Created checkpoint commit `85c0570` for 17 approved files and pushed to `origin/main`. | `BATCH_15C_6_GROUPS_CHECKPOINT_SAFETY_REPORT.md` | Verified Pass | `85c0570` | Pushed | Pushed to GitHub in turn 5. |
| **15D.1** | Social Feed Architecture Audit | Comprehensive read-only audit of post models, route parameters, feeds, and test suites. | `BATCH_15D_1_SOCIAL_FEED_ARCHITECTURE_AUDIT.md` | Verified Pass (169/169) | Untracked report | Not committed | Identified UUID parameter gap and lack of feed search. |
| **15D.2** | Social Feed Backend Hardening | Enforced UUID schemas across 15 post routes, added feed keyword search, bounded inputs. | `BATCH_15D_2_SOCIAL_FEED_BACKEND_HARDENING_REPORT.md` | Verified Pass (209/209) | `ea0629c` | Pushed | 5 files modified, 1 test file created, 0 typecheck/build errors. |
| **15D.3** | Git Safety Audit & Checkpoint Prep | Audited working tree, verified zero secrets, 209 test assertions, typecheck, build, and prepared staging allowlist. | `BATCH_15D_3_GIT_SAFETY_AUDIT_REPORT.md` | Verified Pass (209/209) | `ea0629c` | Pushed | Staging allowlist prepared for checkpoint. |
| **15D.4** | Social Feed Checkpoint Commit | Committed UUID schemas, feed keyword search, project memory, and reports. | `BATCH_15D_3_GIT_SAFETY_AUDIT_REPORT.md` | Verified Pass (209/209) | `ea0629c` | Pushed | Pushed to GitHub origin/main. |
| **15E.1** | Render Build & CORS Hardening | Promoted types, added auto-prisma generation, excluded tests from API build, updated CORS. | `Render Deploy Log` | Verified Pass | `2af6d8f` | Pushed | Pushed to GitHub origin/main. |
| **15E.2** | Render Lockfile & Production Deployment | Promoted type definitions to root dependencies, regenerated package-lock.json, verified live deployment. | `Render Deploy Log` | Verified Pass | `fd6fb0e` | Pushed | Live verified: Render 200 OK & preflight CORS headers confirmed. |
| **15D.5** | Social Feed Frontend Refinements | Added feed search bar (100 char limit), 300ms debouncing, two-way URL sync, Hindi empty states, and UX tests. | `BATCH_15D_5_SOCIAL_FEED_FRONTEND_REFINEMENTS_REPORT.md` | Verified Pass (27/27) | `4e7e615` | Pushed | Monorepo typecheck & build verified clean. |
| **15D.6** | Social Feed Frontend Git Safety Audit | Audited working tree, verified zero secrets, 180 test assertions, typecheck, build, and prepared staging allowlist. | `BATCH_15D_6_GIT_SAFETY_AUDIT_REPORT.md` | Verified Pass (180/180) | `4e7e615` | Pushed | Staging allowlist of 5 files prepared for 15D.7. |
| **15D.7** | Social Feed Frontend Checkpoint & Push | Staged 5 approved files, created checkpoint commit `4e7e615`, and pushed to `origin/main`. | `BATCH_15D_7_CHECKPOINT_REPORT.md` | Verified Pass | `4e7e615` | Pushed | Pushed to GitHub origin/main. |
| **15E.1 (Notif)** | Notifications Architecture Audit | Audited database models, REST routes, Socket.IO rooms, UX components, and security boundaries. Verified 197 test assertions. | `BATCH_15E_1_NOTIFICATIONS_ARCHITECTURE_AUDIT_REPORT.md` | Verified Pass (197/197) | Audit only (Working tree modified) | Not committed | Identified UUID validation gap, missing admin triggers, and Hindi UI localization gap. |
| **15E.2 (Notif)** | Notifications Backend Hardening & Triggers | Added UUID validation schemas, integrated ACCOUNT_STATUS_UPDATE on user status changes, and MATRIMONIAL_PROFILE_APPROVED/REJECTED on profile moderation with actorId: null. | `BATCH_15E_2_NOTIFICATIONS_BACKEND_HARDENING_REPORT.md` | Verified Pass (214/214) | Working tree modified | Not committed | Monorepo typecheck & build passing cleanly. |

---

## F. Current Work & Repository State

- **Current Branch:** `main`
- **Current HEAD:** `4e7e61560275d8e3fc4319c7b63c8d0ad3380726` (`4e7e615`)
- **Upstream Tracking:** Synchronized with `origin/main` (`https://github.com/ravindrakewat/ApnaSamaj.git`).
- **Actual `git status --short`:**
  ```text
   M apps/api/src/modules/admin/matrimonial/admin.matrimonial.service.ts
   M apps/api/src/modules/admin/users/admin.users.service.ts
   M apps/api/src/modules/notifications/notifications.controller.ts
   M docs/PROJECT_HISTORY.md
   M packages/validation/src/notification.ts
  ?? BATCH_15B_8_CHECKPOINT_REPORT.md
  ?? BATCH_15B_9_MEMBER_DIRECTORY_INTEGRATION_REVIEW.md
  ?? BATCH_15D_4_CHECKPOINT_REPORT.md
  ?? BATCH_15D_7_CHECKPOINT_REPORT.md
  ?? BATCH_15E_1_NOTIFICATIONS_ARCHITECTURE_AUDIT_REPORT.md
  ?? BATCH_15E_2_NOTIFICATIONS_BACKEND_HARDENING_REPORT.md
  ?? apps/api/src/tests/notifications-hardening-triggers.test.ts
  ```
- **Latest Completed Batch:** Batch 15E.2 (Notifications Backend Hardening & Admin Trigger Integration).
- **Current In-Progress Batch:** None (Implementation complete).
- **Exact Next Recommended Batch:** **Batch 15E.3 — Notifications Frontend Hindi Localization & UX Refinements**

---

## G. Deployment Notes

- **Source of Truth:** GitHub repository (`https://github.com/ravindrakewat/ApnaSamaj.git`).
- **Frontend Hosting (Vercel):**
  - Hosts `apps/web` (Member Portal) and `apps/admin` (Admin Management Portal).
  - Vercel connects directly to GitHub. Auto-deployment triggers on push to `main` for configured project roots.
  - Build command: `npm run build` with root directory set to `apps/web` or `apps/admin`.
  - Always verify deployment status and runtime health in the Vercel project dashboard.
- **Backend Hosting (Render):**
  - Hosts `apps/api` (Core Backend API).
  - Render web service is connected to GitHub repository tracking `main`.
  - Build command: `npm run build --workspace=@apnasamaj/api` or monorepo build script.
  - Start command: `node apps/api/dist/index.js` or configured npm start script.
  - If auto-deploy is enabled on Render, any push to `main` initiates a build and deployment.
  - Always verify deployment status, build logs, and health check response (`/health`) in the Render dashboard.
- **Credential & Secret Protection:**
  - **NEVER** write or store API keys, passwords, database URLs, `.env` file contents, or JWT secrets in any Markdown file, commit message, or tracked repository file.
  - Secrets are configured exclusively via the respective hosting platform's secure environment variable settings (Vercel Environment Variables, Render Environment Variables, Supabase Settings).

---

## H. Continuation Protocol

### At the Start of Every Session (or Machine Switch):
1. **Read this file (`docs/PROJECT_HISTORY.md`)** to understand completed work, current HEAD, and next steps.
2. **Inspect the actual repository state:**
   ```bash
   git branch --show-current
   git rev-parse HEAD
   git status --short
   git log -n 5 --oneline
   ```
3. **Read the latest batch report** corresponding to the current state (e.g. `BATCH_15D_5_SOCIAL_FEED_FRONTEND_REFINEMENTS_REPORT.md`).
4. **Compare actual repository state with recorded history.** Verify whether uncommitted files match Section F.
5. **Identify the next planned batch** (e.g. Batch 15D.6).
6. **Ask for clarification** if the recorded history conflicts with actual repository files or if an unresolved safety issue exists.

### At the End of Every Batch:
1. **Update `docs/PROJECT_HISTORY.md`** with verified outcomes, modified files, and new commit hashes.
2. **Record modified and untracked files** accurately in Section F.
3. **Record test commands and actual results** (clearly indicating whether assertions were independently run or reported).
4. **Record commit and push status separately.** Never state a commit was pushed without verifying upstream status via `git status` or `git rev-parse origin/main`.
5. **Record the next recommended batch** to ensure seamless continuation in subsequent sessions.
