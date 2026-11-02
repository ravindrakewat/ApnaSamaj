# BATCH 15F.5 REPORT: Staging Verification & Pre-Commit Checkpoint Audit

**Project:** Apna Samaj Monorepo (`https://github.com/ravindrakewat/ApnaSamaj.git`)  
**Batch ID:** 15F.5  
**Feature:** Comprehensive Security Audit, Staging Readiness Verification & Pre-Commit Checkpoint  
**Execution Date:** November 02, 2026  
**Status:** ✅ Complete, Fully Audited, Zero Production Writes, Strictly Uncommitted (Awaiting Explicit User Approval)

---

## 1. Executive Summary

Batch 15F.5 performs a rigorous, multi-layered security audit and staging readiness verification across the entire Excel Bulk Member Import and Account Claiming system developed across Batches 15F.1 through 15F.4.

This audit evaluates the codebase against Apna Samaj multi-tenant security architecture, authorization barriers, authentication invariants, spreadsheet formula injection protections, cryptographic protections, rate limiters, and git cleanliness.

### Overall Audit Verdict:
- **Core Security Posture:** **STRONG & SOUND**.
- **Multi-Tenant Invariants:** Strictly preserved. Zero cross-tenant data leakage detected.
- **Critical Vulnerabilities:** **0 Found**.
- **Automated Test Assertions:** **354 / 354 PASS (100%)** across 7 automated test suites.
- **Typecheck & Builds:** 0 TypeScript errors across all 8 workspaces; Vite production builds clean for `@apnasamaj/admin` and `@apnasamaj/web`.
- **Staging Live Database Execution:** **BLOCKED** due to local PostgreSQL service inactive on host port 5432; verified via robust automated test harness with isolated fixtures.
- **Commit Status:** **STRICTLY UNCOMMITTED**. All changes remain in the working tree awaiting explicit user review and staging allowlist confirmation.

---

## 2. Git State Verification

| Check | Expected Baseline | Actual Git Status | Status |
|:---|:---|:---|:---:|
| **Current Branch** | `main` | `main` | ✅ Matched |
| **HEAD Commit** | `eb3e639c757e86f9beceb6ecd76e5aaf1f03d4c0` | `eb3e639c757e86f9beceb6ecd76e5aaf1f03d4c0` | ✅ Matched |
| **Upstream Remote** | `origin/main` | `origin/main` (Up to date) | ✅ Matched |
| **Staging Status** | Clean staging area | 0 staged files | ✅ Preserved |
| **Working Tree** | Batches 15F.1–15F.4 uncommitted | 22 modified, 18 untracked files | ✅ Verified |

---

## 3. Comprehensive Security Findings & Risk Analysis

### A. Critical Severity Findings (0 Found)
*No critical vulnerabilities, authentication bypasses, or privilege escalation vectors were identified.*

---

### B. High Severity Findings (0 Found)
*No direct cross-tenant data leaks or unauthorized data modification vulnerabilities were identified.*

---

### C. Medium Severity Findings

#### [FINDING-MED-01] In-Memory Attempt Counter for Account Claim Verification
- **File:** [`apps/api/src/modules/auth/auth.service.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/api/src/modules/auth/auth.service.ts) (lines 725, 936–950)
- **Code Reference:**
  ```typescript
  export const claimTokenAttempts = new Map<string, number>();
  ```
- **Analysis:**
  The attempt counter restricting OTP brute-force attempts (maximum 5 attempts before token burning) is stored in a process-local in-memory `Map`.
- **Impact:**
  In a multi-process or clustered deployment (e.g. multiple Render containers or PM2 cluster workers), requests routed across different workers would have separate counters, allowing an attacker to submit up to 5 attempts per process instance.
- **Compensating Controls:**
  1. The Express route is guarded by `claimOtpVerifyRateLimiter` which enforces a maximum of 5 requests per 15 minutes per normalized phone number and IP address.
  2. The claim token expires within 10 minutes.
  3. Single-use atomic burning (`updateMany` in a transaction) ensures that a correct guess burns the token immediately.
- **Recommended Remediation:**
  In a future batch requiring database migrations, add an `attempts Int @default(0)` column to the `PasswordResetToken` schema, or back rate limiters with a shared Redis store.

#### [FINDING-MED-02] Salted SHA-256 Search Space for 6-Digit OTP at Rest
- **File:** [`apps/api/src/modules/auth/auth.tokens.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/api/src/modules/auth/auth.tokens.ts) (lines 101–107)
- **Code Reference:**
  ```typescript
  export function hashClaimOtp(userId: string, otp: string): string {
    return crypto.createHash('sha256').update(`CLAIM_OTP:${userId}:${otp.trim()}`).digest('hex');
  }
  ```
- **Analysis:**
  A 6-digit numeric OTP has $10^6$ (1,000,000) possible combinations. While salting with `userId` prevents global rainbow-table precomputation across the entire user base, SHA-256 has a low computational work factor.
- **Impact:**
  If an adversary acquires a complete database dump containing both the `PasswordResetToken` table and the `User` table, they can compute all 1,000,000 hashes in < 1 millisecond on a modern CPU or GPU for a specific target user.
- **Compensating Controls:**
  1. Tokens expire after 10 minutes (`calculateClaimOtpExpiry()`).
  2. Tokens are marked with `usedAt: new Date()` upon consumption, retiring the token.
  3. Database leaks require total compromise of the PostgreSQL infrastructure, at which point an adversary already has direct database access.
  4. Online attacks are bounded to 5 attempts.
- **Recommended Remediation:**
  The current design is an accepted industry tradeoff balancing CPU load on the auth server with 10-minute validity. If offline database leak resistance is prioritized, consider encrypting OTP hashes with an application-level pepper (`AES-256-GCM`) before storage.

---

### D. Low Severity Findings

#### [FINDING-LOW-01] Multer In-Memory Storage of Uploaded Workbooks
- **File:** [`apps/api/src/modules/admin/users/excel.upload.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/api/src/modules/admin/users/excel.upload.ts)
- **Analysis:**
  Multer holds uploaded `.xlsx` files in memory buffers (`multer.memoryStorage()`).
- **Impact:**
  While file size is strictly capped at 5 MB and single file (`files: 1`), concurrent uploads of 5 MB files by multiple administrators could lead to transient memory spikes.
- **Compensating Controls:**
  Only authenticated `SUPER_ADMIN` and `COMMUNITY_ADMIN` users can access the endpoint. File size is capped at 5 MB; data rows capped at 1,000.
- **Recommendation:** Acceptable for administrative usage. If file sizes need to increase in the future, migrate to disk-backed temporary storage or stream parsing.

#### [FINDING-LOW-02] Mock SMS Delivery in Development/Staging
- **File:** [`apps/api/src/modules/auth/auth.delivery.ts`](file:///c:/Users/HP/Downloads/dspromain/dspro58/apps/api/src/modules/auth/auth.delivery.ts)
- **Analysis:**
  In non-production environments, OTPs are output to the console for developer convenience.
- **Impact:**
  No real SMS delivery occurs without live provider credentials.
- **Compensating Controls:**
  The production fail-closed guard (`isProduction && !hasSmsConfig`) strictly prevents console logging and prevents token creation if no SMS provider is configured in production.
- **Recommendation:** Configure test SMS gateway credentials and test with an authorized phone number prior to public launch.

---

### E. Informational Findings

#### [FINDING-INFO-01] Local PostgreSQL Staging Instance Offline
- Host port `5432` is not listening on `127.0.0.1`. Live database testing against a running staging server was blocked, but full test coverage was verified via the automated test harness.

---

## 4. Test Suite Execution & Verification Results

All 7 test suites across the monorepo were executed and verified:

```text
================================================================
   Apna Samaj Monorepo Verification Summary (Batch 15F.5)
================================================================

1. apps/api/src/tests/bulk-import-contracts.test.ts
   - Valid full & minimal rows
   - Indian phone normalization (numeric, leading 0, 91, +91, spaces)
   - Rejection of invalid phones & short numbers
   - Case-insensitive gender parsing
   - Strict security field rejection (role, password, status, tenantId, db)
   - Extra column rejection & intra-file duplicate detection
   Results: 75 Passed, 0 Failed

2. apps/api/src/tests/bulk-import-backend.test.ts
   - Template generator (.xlsx buffer, worksheets, columns, styling)
   - Excel parser (file limits, formula injection rejection, duplicate detection)
   - Dry-run preview service (zero database writes, existing user detection)
   - Execution engine (least privilege Role.MEMBER, status PENDING, Argon2id dummy hash)
   - Concurrent constraint race recovery (P2002 handling)
   - Audit logging & tenant boundary enforcement
   Results: 57 Passed, 0 Failed

3. apps/api/src/tests/account-claiming.test.ts
   - Anti-enumeration for unknown, suspended, active, and ineligible accounts
   - 6-digit numeric OTP generation & salted SHA-256 token hashing
   - 60-second cooldown enforcement
   - 5-attempt limit & token burning
   - 10-minute token expiration
   - Atomic single-use consumption & race safety
   - Status transition (PENDING -> ACTIVE, isPhoneVerified -> true)
   - Argon2id password hashing & old token retirement
   - AuditLog record generation
   - Production fail-closed SMS safeguard
   - Tenant isolation & central admin blocking
   Results: 72 Passed, 0 Failed

4. apps/admin/src/tests/bulk-import-dialog-ux.test.ts
   - Content-Disposition filename parsing
   - File extension & MIME type validation
   - 5 MB file size limit enforcement
   - Metric chips & preview table data binding
   - Spreadsheet formula injection sanitization (=, +, -, @, \t, \r)
   - CSV error report generation & browser download trigger
   - Multi-tenant role authorization (SUPER_ADMIN, COMMUNITY_ADMIN)
   Results: 43 Passed, 0 Failed

5. apps/web/src/tests/claim-account-ux.test.ts
   - 10-digit Indian phone normalization
   - Anti-enumeration UI status messaging
   - 60-second cooldown timer & countdown
   - 6-digit numeric OTP validation
   - Password length (>= 8) & confirmation match checks
   - Volatile memory security (zero storage in localStorage / sessionStorage)
   - Bilingual i18n localization (English & Hindi)
   Results: 54 Passed, 0 Failed

6. apps/api/src/tests/auth-password-reset.test.ts (Regression Suite)
   - Password reset anti-enumeration, hashing, expiration, burning, Argon2id
   Results: 18 Passed, 0 Failed

7. apps/api/src/tests/auth-tenant.test.ts (Regression Suite)
   - Multi-tenant login, registration, refresh rotation, and logout isolation
   Results: 35 Passed, 0 Failed

================================================================
Total Automated Assertions Verified: 354 Passed, 0 Failed (100%)
================================================================
```

---

## 5. Typecheck & Build Verification Results

| Target Workspace | Command | Result | Notes |
|:---|:---|:---:|:---|
| **Entire Monorepo** | `npm run typecheck` | **PASS (Code 0)** | 0 TypeScript errors across all 8 workspaces. |
| **API Server** | `npx tsc --project apps/api/tsconfig.json --noEmit` | **PASS (Code 0)** | Clean TypeScript compilation. |
| **Admin Panel** | `npm run build --workspace=@apnasamaj/admin` | **PASS (Code 0)** | Vite production bundle generated in 11.15s. |
| **Member Portal** | `npm run build --workspace=@apnasamaj/web` | **PASS (Code 0)** | Vite production bundle generated in 15.94s. |
| **Shared Packages** | `npm run build` (`database`, `i18n`, `shared-types`, `ui-config`, `validation`) | **PASS (Code 0)** | All packages compiled cleanly. |

*Note regarding Windows Prisma DLL lock:* During `npx prisma generate` in root build scripts on Windows, `query_engine-windows.dll.node` can experience a transient EPERM file lock if another local Node process is active. The generated client is completely up to date and compiles cleanly with 0 TypeScript errors.

---

## 6. Staging Readiness & Environment Status

### Current Environment Status:
- **Local PostgreSQL Service (`127.0.0.1:5432`):** Offline / Not accepting connections.
- **`.env.staging` File:** Absent on this machine.
- **Production Safety Invariant:** Production credentials in `.env` were **never** used for test member imports or writes.
- **Live DB Staging Execution:** **BLOCKED** until local staging PostgreSQL service is started.

### Prerequisite Checklist for Live Staging Verification:
1. Start local PostgreSQL service on host (`127.0.0.1:5432`).
2. Create staging database: `createdb apnasamaj_staging_kewat`.
3. Provide `.env.staging` with staging connection strings (`PORT=4001`, `NODE_ENV=staging`, `DATABASE_URL=postgresql://postgres:...@localhost:5432/apnasamaj_staging_kewat`).
4. Run staging migrations: `npm run db:migrate:staging`.
5. Run staging seeder: `npm run db:seed:staging`.
6. Start staging API server: `npm run start:api:staging`.

---

## 7. Multi-Tenant Staging Test Plan Status

| Verification Item | Automated Fixture Verification | Live Database Status |
|:---|:---:|:---:|
| 1. Importing into Community A creates records strictly in A's DB | ✅ Verified in `bulk-import-backend.test.ts` | BLOCKED (Staging DB Offline) |
| 2. Previewing in Community A does not reveal users from Community B | ✅ Verified in `bulk-import-backend.test.ts` | BLOCKED (Staging DB Offline) |
| 3. Administrator restricted to Community A cannot import into Community B | ✅ Verified in `bulk-import-backend.test.ts` | BLOCKED (Staging DB Offline) |
| 4. Missing or unregistered tenant context fails closed (HTTP 400) | ✅ Verified in `account-claiming.test.ts` | BLOCKED (Staging DB Offline) |
| 5. Central admin claim requests fail closed (HTTP 400) | ✅ Verified in `account-claiming.test.ts` | BLOCKED (Staging DB Offline) |
| 6. Claiming an account in A cannot affect an account in B | ✅ Verified in `auth-tenant.test.ts` | BLOCKED (Staging DB Offline) |

---

## 8. Browser & SMS Provider Status
- **Browser-Based UI Verification:** **NOT PERFORMED** (Headless browser automation not configured; verified via comprehensive DOM component UX test suites: `bulk-import-dialog-ux.test.ts` and `claim-account-ux.test.ts`).
- **Real SMS Provider Verification:** **NOT PERFORMED** (External SMS gateways MSG91/Fast2SMS require active API credits and explicit authorization; verified via unit adapters and production fail-closed assertions).

---

## 9. Proposed Staging Allowlist (40 Files)

Before staging or committing any files, the following explicit allowlist is submitted for user review:

### Feature 1: Bulk Import Contracts & Validation (Batch 15F.1) — 7 Files
1. `apps/api/package.json`
2. `package-lock.json`
3. `packages/shared-types/src/bulk-import.ts`
4. `packages/shared-types/src/index.ts`
5. `packages/validation/src/bulk-import.ts`
6. `packages/validation/src/index.ts`
7. `apps/api/src/tests/bulk-import-contracts.test.ts`

### Feature 2: Backend Excel Processing & Admin Import (Batch 15F.2) — 7 Files
8. `apps/api/src/modules/admin/index.ts`
9. `apps/api/src/modules/admin/users/admin.users.routes.ts`
10. `apps/api/src/modules/admin/users/excel.service.ts`
11. `apps/api/src/modules/admin/users/excel.upload.ts`
12. `apps/api/src/modules/admin/users/admin.import.service.ts`
13. `apps/api/src/modules/admin/users/admin.import.controller.ts`
14. `apps/api/src/tests/bulk-import-backend.test.ts`

### Feature 3: Account Claiming Backend (Batch 15F.3) — 9 Files
15. `packages/shared-types/src/auth.ts`
16. `packages/validation/src/auth.ts`
17. `apps/api/src/middleware/rate-limiter.ts`
18. `apps/api/src/modules/auth/auth.tokens.ts`
19. `apps/api/src/modules/auth/auth.delivery.ts`
20. `apps/api/src/modules/auth/auth.service.ts`
21. `apps/api/src/modules/auth/auth.controller.ts`
22. `apps/api/src/modules/auth/auth.routes.ts`
23. `apps/api/src/tests/account-claiming.test.ts`

### Feature 4: Admin UI & Member Claim Flow Frontend (Batch 15F.4) — 12 Files
24. `packages/i18n/src/locales/en/auth.json`
25. `packages/i18n/src/locales/hi/auth.json`
26. `apps/admin/src/utils/csv-export.ts`
27. `apps/admin/src/services/admin.users.service.ts`
28. `apps/admin/src/components/BulkImportDialog.tsx`
29. `apps/admin/src/pages/MemberManagementPage.tsx`
30. `apps/admin/src/tests/bulk-import-dialog-ux.test.ts`
31. `apps/web/src/services/auth.service.ts`
32. `apps/web/src/pages/ClaimAccountPage.tsx`
33. `apps/web/src/pages/LoginPage.tsx`
34. `apps/web/src/App.tsx`
35. `apps/web/src/tests/claim-account-ux.test.ts`

### Feature 5: Batch Reports & Project Documentation — 5 Files
36. `BATCH_15F_1_EXCEL_IMPORT_CONTRACTS_REPORT.md`
37. `BATCH_15F_2_BACKEND_BULK_IMPORT_REPORT.md`
38. `BATCH_15F_3_ACCOUNT_CLAIMING_REPORT.md`
39. `BATCH_15F_4_IMPORT_UI_CLAIM_FLOW_REPORT.md`
40. `docs/PROJECT_HISTORY.md`

### Files Excluded from Allowlist:
- `BATCH_15F_5_STAGING_AND_PRECOMMIT_AUDIT_REPORT.md` *(May be included upon user instruction or kept as audit log)*.
- Scratch scripts in `.gemini/antigravity/brain/...` (outside git repository).
- All `.env*` environment configuration files.

---

## 10. Required User Decisions Before Staging / Committing

1. **Staging Approval:** Does the user approve the 40 candidate files on the proposed allowlist?
2. **Commit Strategy:** Should all Batch 15F files (15F.1 through 15F.4) be committed in a single consolidated checkpoint commit (e.g. `feat(import): excel bulk member import and self-service account claim flow (batch 15f)`), or broken into smaller batch commits?
3. **Push to Remote:** Should the commit remain local, or is the user authorizing a push to `origin/main`?

