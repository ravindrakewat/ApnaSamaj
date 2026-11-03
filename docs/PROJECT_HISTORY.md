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
| `3d36b06` | `3d36b0606ba30282b04c8fcf2c62c2f62779fa7b` | `fix(admin): mount BulkImportDialog in MemberManagementPage` | Admin Member Import Fix | **Confirmed** | **Confirmed (Pushed)** |
| `247fb6d` | `247fb6d7ad4fe5bca836ef4997ec7d7c58e14313` | `feat(feed): implement social feed localization and direct video upload` | Social Feed i18n + Video Upload | **Confirmed** | **Confirmed (Pushed)** |
| `e02c6f2` | `e02c6f272a2ceca805e75da76814631377a06c8b` | `feat(feed): implement post title and structured content with backward compatibility` | Post Title & Structured Content | **Confirmed** | **Confirmed (Pushed)** |
| `6a9795b` | `6a9795b36bb032c5890c291244349e5d4cb0d82d` | `feat(i18n): localize member directory, community groups, and matrimonial modules in hindi and english` | Batch 15H.1, 15H.2, 15H.3 | **Confirmed** | **Confirmed (Pushed)** |
| `b114d26` | `b114d26f5e70b287547824aebbe99cf2d9830dfa` | `feat(i18n): localize member directory, community groups, and matrimonial modules in hindi and english` | Batch 15H Checkpoint | **Confirmed** | **Confirmed (Pushed)** |

### Current HEAD & Remote Synchronization:
- **Active Branch:** `main`
- **Current HEAD:** `b114d26f5e70b287547824aebbe99cf2d9830dfa` (`b114d26`)
- **Remote Tracking Reference:** `origin/main` (`https://github.com/ravindrakewat/ApnaSamaj.git`)
- **Upstream Sync Status:** Synchronized with `origin/main` following user push request.

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
| **15E.2 (Notif)** | Notifications Backend Hardening & Triggers | Added UUID validation schemas, integrated ACCOUNT_STATUS_UPDATE on user status changes, and MATRIMONIAL_PROFILE_APPROVED/REJECTED on profile moderation with actorId: null. | `BATCH_15E_2_NOTIFICATIONS_BACKEND_HARDENING_REPORT.md` | Verified Pass (214/214) | `e89aeee` | Pushed | Monorepo typecheck & build passing cleanly. Pushed to GitHub origin/main. |
| **15E.3A (i18n)** | Multilingual Architecture & Localization Plan | Read-only audit & architecture blueprint across monorepo for Hindi-first localization, shared `@apnasamaj/i18n`, client persistence, and typography. | `BATCH_15E_3A_MULTILINGUAL_ARCHITECTURE_PLAN.md` | Verified Specification | Audit only | Not committed | Decoupled URLs from locale state, established two-tier persistence. |
| **15E.3B (i18n)** | Shared Multilingual Foundation & Web App Language Selector | Created `@apnasamaj/i18n` workspace package, dual-language resources (`hi` default, `en`), accessible `LanguageSelector.tsx`, Navbar integration, and typography font stack. | `BATCH_15E_3B_MULTILINGUAL_FOUNDATION_REPORT.md` | Verified Pass (206/206) | `cb35183` | Pushed | 26 unit tests passed, all 8 workspaces typecheck & build clean. Pushed to origin/main. |
| **15E.3C (i18n/Notif)** | Notifications Localization & Mobile UX | Localized `NotificationBell.tsx` via `notifications` namespace, implemented localized relative time helper for Hindi/English, and enhanced mobile viewport & touch UX. | `BATCH_15E_3C_NOTIFICATIONS_LOCALIZATION_REPORT.md` | Verified Pass (256/256) | `cb35183` | Pushed | 31 unit tests passed, 256 monorepo frontend assertions verified pass. Pushed to origin/main. |
| **15E.4** | Avatar Upload Resilience & Supabase Fallback | Transparent `StorageError` handling in avatar controller, automatic bucket creation with retry, and resilient inline Data URL fallback preventing HTTP 500 errors. | `BATCH_15E_4_AVATAR_STORAGE_RESILIENCE_REPORT.md` | Verified Pass (7/7 resilience, 64/64 security) | `c873e2c` | Pushed | Monorepo typecheck & build passing cleanly across all 8 packages. |
| **15E.5** | Matrimonial Listing Cards Image Rendering Fix | Resolved missing matrimonial photo query in discovery and interest listings, added `primaryPhotoUrl`, implemented `MatrimonialCardMedia` with `onError` fallback, and ensured Full Profile consistency. | `BATCH_15E_5_MATRIMONIAL_CARD_IMAGE_RENDERING_REPORT.md` | Verified Pass (10/10 frontend, 77/77 backend) | `eb3e639` | Pushed | Monorepo typecheck & build passing cleanly across all 8 packages. |
| **15F.1** | Excel Bulk Member Import Contracts & DTOs | Added strongly typed DTOs, reusable Zod schemas with phone normalization, case-insensitive gender, strict security boundaries, and exceljs dependency. | `BATCH_15F_1_EXCEL_IMPORT_CONTRACTS_REPORT.md` | Verified Pass (75/75 contracts, monorepo typecheck & build) | `ae2fe5e` | Pushed | Monorepo typecheck & build passing cleanly across all 8 packages. |
| **15F.2** | Backend Excel Bulk Member Import | Implemented template generator, buffer parser with formula injection defense, dry-run preview, atomic chunked execution with Argon2id dummy hashes, and audit logging. | `BATCH_15F_2_BACKEND_BULK_IMPORT_REPORT.md` | Verified Pass (57/57 backend, 75/75 contracts, monorepo typecheck & build) | `ae2fe5e` | Pushed | Monorepo typecheck & build passing cleanly across all 8 packages. |
| **15F.3** | Account Activation / Claiming Alignment | Secure self-service account-claiming & initial password-setup via 6-digit SMS OTP, salted SHA-256 tokens, Argon2id passwords, single-use burning, rate limits, and audit logging. | `BATCH_15F_3_ACCOUNT_CLAIMING_REPORT.md` | Verified Pass (72/72 claiming, 57/57 backend, 75/75 contracts, 18/18 reset) | `ae2fe5e` | Pushed | Monorepo typecheck & build passing cleanly across all 8 workspaces. |
| **15F.4** | Admin Bulk Import UI & Member Claim Flow | 3-step import modal, dry-run preview, formula-injection-safe CSV export, member `/claim-account` page, 60s OTP cooldown, login link. | `BATCH_15F_4_IMPORT_UI_CLAIM_FLOW_REPORT.md` | Verified Pass (43 admin UX, 54 web UX, 301 total 15F suite) | `ae2fe5e` | Pushed | Monorepo typecheck & build passing cleanly across all 8 packages. |
| **15F.5** | Staging Verification & Pre-Commit Checkpoint Audit | Comprehensive security audit, staging readiness check, formula defense check, 354 automated assertions verified, allowlist preparation. | `BATCH_15F_5_STAGING_AND_PRECOMMIT_AUDIT_REPORT.md` | Verified Pass (354/354 assertions, 7 suites) | `ae2fe5e` | Pushed | Staging DB offline (blocked live test); 0 critical vulnerabilities. |
| **15G.1** | Social Feed Localization (Hindi/English) | Registered `feed` i18n namespace, added 147 translation keys with 1:1 Hindi/English parity across FeedPage, CreatePostComposer, PostCard, PostDetailPage, and relative timestamp formatting. | `BATCH_15G_1_SOCIAL_FEED_LOCALIZATION_REPORT.md` | Verified Pass (25/25 tests, clean typecheck & build) | Uncommitted | Working tree | Clean working tree changes preserved. |
| **15G.2** | Direct Video Upload + YouTube Video Integration | Authenticated MP4/WebM video uploads, memory-safe disk streaming upload via Multer, server-side magic bytes validation (128-byte header read), 30MB/90s bounds, video preview card with progress/retry, and zero DB migration using existing `PostMedia`. | `BATCH_15G_2_VIDEO_UPLOAD_REPORT.md` | Verified Pass (35 backend + 45 frontend + 25 15G.1 = 105/105 tests pass) | Uncommitted | Working tree | Clean working tree changes preserved. |
| **15F Fix** | Admin Excel Member Import Modal Mounting Fix | Fixed missing <BulkImportDialog /> in JSX of MemberManagementPage.tsx, restored modal trigger, verified FormData boundary handling, added lifecycle tests. | BATCH_MEMBER_EXCEL_IMPORT_FIX_REPORT.md | Verified Pass (53 admin UX, 57 backend, 75 contracts, 8/8 typecheck & build) | Uncommitted | Working tree | Clean working tree changes preserved. Batch 15G.1 & 15G.2 files untouched. |
| **15G.3** | Stabilization & 2-Commit Checkpoint Execution | Read-only stabilization audit across Feed i18n, Video Upload, and Admin Member Import Fix. Created Commit 1 (3d36b06) and Commit 2 (247fb6d). Verified 290 automated tests, clean typecheck, and production builds. | BATCH_15G_3_STABILIZATION_REPORT.md | Verified Pass (290/290 tests, clean typecheck & builds) | 3d36b06, 247fb6d | Local main (ahead 2) | All files committed cleanly. Ready for Batch 15H. |
| **15G.4** | Next-Batch Architectural Planning Audit | Evaluated 6 prioritized candidate batches across UI localization, notifications, chat, audio, analytics, and tenant management. Formulated 4-phase roadmap and recommended Batch 15H.1. | BATCH_15G_4_PLANNING_REPORT.md | Verified (Clean audit) | Working tree | Planning report preserved. |
| **15H.1** | Member Directory & Profile Localization (Hindi/English) | Registered `directory` i18n namespace with 55 translation keys (1:1 Hindi/English parity), localized `DirectoryPage.tsx` and `MemberProfilePage.tsx`, added Indian locale date formatting (`hi-IN` / `en-IN`), preserved raw user data (names, cities, gotras, bios), added 14 automated UX tests. | BATCH_15H_1_DIRECTORY_LOCALIZATION_REPORT.md | Verified Pass (14 directory UX + 25 feed UX + 45 directory UX + 53 admin UX + 35 video = 172/172 tests, clean monorepo typecheck across 8 workspaces & Vite build) | 6a9795b | Confirmed (Pushed) | Committed & pushed in Batch 15H checkpoint. |
| **15H.2** | Groups & Mandals Localization (Hindi/English) | Registered `groups` i18n namespace with 138 translation keys (1:1 Hindi/English parity), localized `GroupsPage.tsx` and `GroupDetailPage.tsx` (headers, filters, privacy chips, tabs, membership badges, dialogs, member roster, role management), preserved raw user data (group names, member names, discussions, descriptions), added 15 automated UX tests. | BATCH_15H_2_GROUPS_LOCALIZATION_REPORT.md | Verified Pass (15 groups UX + 57 groups frontend UX + 14 directory UX + 25 feed UX = 111 tests, clean monorepo typecheck across 8 workspaces & Vite build) | 6a9795b | Confirmed (Pushed) | Committed & pushed in Batch 15H checkpoint. |
| **Post Title** | Post Title & Structured Content | Added optional title for GENERAL posts, required title for ANNOUNCEMENT and EVENT posts, updated Prisma schema (`title String?`), created migration SQL artifact (`20261102193000_add_post_title`), updated shared types, Zod schemas, posts service with title persistence & search filter, 10 new i18n keys with 100% Hindi/English parity, UI inputs in composer and card/detail views, and 26 automated tests. | BATCH_POST_TITLE_IMPLEMENTATION_REPORT.md | Verified Pass (26 post title UX + 25 feed UX + 14 directory UX + 15 groups UX + 35 video = 115 tests, clean monorepo typecheck across 8 workspaces & Vite build) | e02c6f2 | Local main (ahead 3) | Clean commit verified. |
| **15H.3** | Matrimonial Module Localization (Hindi/English) | Registered `matrimonial` i18n namespace with 165 translation keys (100% Hindi/English parity), localized `MatrimonialDiscoveryPage.tsx`, `MatrimonialDashboardPage.tsx` (7 tabs, forms, options, dialogs), `MatrimonialProfileDetailPage.tsx`, `ReceivedInterestsList.tsx`, and `SentInterestsList.tsx`. Preserved raw user data (names, bios, gotras), enforced phone number privacy boundaries, added 13 automated UX tests. | BATCH_15H_3_MATRIMONIAL_LOCALIZATION_REPORT.md | Verified Pass (13 matrimonial UX + 38 matrimonial tests + 26 post title UX + 25 feed UX + 15 groups UX + 35 video = 152 tests, clean monorepo typecheck across 8 workspaces & Vite build) | 6a9795b | Confirmed (Pushed) | Committed & pushed in Batch 15H checkpoint. |
| **Post Image Fix** | Post Image Upload Failure & Connection Pool Resiliency | Resolved feed image upload failures, added single-click retry UX with localized errors in `CreatePostComposer.tsx`, hardened `uploadPostMedia` in `storage.service.ts` with Supabase exception wrapping and mock fallback, tuned Prisma default & tenant connection pool limits to 10 (timeout 20s) to prevent concurrent auth connection starvation, added 31 image UX regression tests. | BATCH_POST_IMAGE_UPLOAD_FIX_REPORT.md | Verified Pass (136/136 tests: 25 post media + 31 image UX + 45 video UX + 35 direct video, clean monorepo typecheck across 8 workspaces) | Pending Push | Staged and committed per user request |

---

## F. Current Work & Repository State

- **Current Branch:** `main`
- **Current HEAD:** `b114d26f5e70b287547824aebbe99cf2d9830dfa` (`b114d26`)
- **Upstream Tracking:** Synchronized with `origin/main`.
- **Actual `git status --short`:**
  ```text
  Working tree 100% clean. All work committed and pushed to origin/main.
  ```
- **Latest Completed Batch:** **Post Image Upload Failure & Connection Pool Resiliency Fix**.
- **Current In-Progress Batch:** Committed and pushed to `origin/main` for multi-machine synchronization.
- **Exact Next Recommended Batch:** **Batch 15H.4 — Matrimonial Admin Moderation & Appeals Localization**.

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
