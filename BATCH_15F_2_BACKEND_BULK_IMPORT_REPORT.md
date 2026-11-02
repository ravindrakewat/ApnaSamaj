# Batch 15F.2 — Backend Excel Bulk Member Import

**Date:** 2026-11-01  
**Batch ID:** Batch 15F.2  
**Scope:** Phase 3 of Excel Bulk Member Import with Self-Service Password Setup  
**Repository:** `ravindrakewat/ApnaSamaj`  
**Git Branch:** `main`  
**Commit Baseline:** `eb3e639c757e86f9beceb6ecd76e5aaf1f03d4c0` (HEAD)  
**Execution Mode:** Uncommitted working tree modifications (Preserved for review; zero push/deploy).

---

## 1. Executive Summary

In accordance with Phase 3 specifications and the approved architecture audit, this batch implements the backend Excel bulk member import engine for Apna Samaj.

All multi-tenant and authentication security invariants are preserved:
- **Zero Insecure Passwords:** High-entropy 256-bit unguessable random strings (`crypto.randomBytes(32).toString('hex')`) are hashed with Argon2id at rest. No plaintext passwords exist; no shared default passwords exist.
- **Strict Least-Privilege & Escalation Barrier:** Every imported user is programmatically assigned `Role.MEMBER`. Attempts to specify roles in the spreadsheet are strictly rejected.
- **Zero Sensitive Overwrites:** Existing accounts (matched by normalized mobile number) are never overwritten. Their passwords, roles, profiles, and account statuses remain untouched.
- **Approval Policy Preservation:** Imported accounts are created with `status: UserStatus.PENDING` and `isPhoneVerified: false`. Account claiming via Forgot Password will be handled in Phase 4 once approval transitions are established.
- **Strict Physical Tenant Scoping:** Every operation resolves to `req.db` via `assertDb(req.db)`. Unregistered communities reject with HTTP 404; cross-tenant imports are blocked.
- **Formula Injection Defense:** Formulas are strictly rejected from member data cells, preventing CSV/formula injection and untrusted calculated identity data.
- **Safe Transaction Boundaries:** Imports are processed in chunks of 50 inside Prisma `$transaction` blocks. Concurrent constraint race conditions (`P2002`) are safely caught and reported as skips without crashing the entire batch.
- **Immutable Audit Logging:** Every execution creates an `AuditLog` entry in the target tenant database recording the administrator actor ID, total rows, imported count, skipped count, and failure count.

---

## 2. Changes Implemented

### A. Excel Service (`apps/api/src/modules/admin/users/excel.service.ts`)
- **`generateImportTemplate()`:**
  - Generates `.xlsx` workbook with two worksheets: `Members` and `Instructions`.
  - Columns: `Full Name`, `Mobile Number`, `Gender`, `City`, `State`, `Sub-Caste`, `Gotra`.
  - Header styling: Dark blue fill (`#1E3A8A`), white bold text, row height 30, centered alignment.
  - Formats column B as Text (`@`) to preserve leading zeros.
  - Embeds data validation dropdown for Gender: `MALE, FEMALE, OTHER`.
  - Provides 2 sample rows and an exhaustive instructions worksheet with security notices.
- **`parseExcelBuffer(buffer)`:**
  - Enforces 5 MB file size limit and maximum 1,000 data rows.
  - Validates headers against canonical mappings and rejects unexpected or forbidden columns (`role`, `password`, `status`, `tenantId`, etc.).
  - Extracts cell values while strictly detecting and rejecting formulas (`isFormula: true`).
  - Normalizes phone numbers to Indian E.164 (`+91XXXXXXXXXX`) and validates rows via `@apnasamaj/validation`.
  - Detects intra-file duplicate phone numbers and pinpoints the original row number.

### B. Upload Middleware (`apps/api/src/modules/admin/users/excel.upload.ts`)
- Configured `multer` memory storage with 5 MB size limit (`5 * 1024 * 1024` bytes) and single file filter (`files: 1`).
- Validates file extension strictly (`.xlsx`) and MIME type.
- Returns clean JSON `ApiResponse` on `LIMIT_FILE_SIZE` or `INVALID_FILE_TYPE`.

### C. Admin Import Service (`apps/api/src/modules/admin/users/admin.import.service.ts`)
- **`getImportTemplate()`:** Streams `.xlsx` template buffer.
- **`previewBulkImport(fileBuffer, db)`:**
  - Dry-run parsing with **ZERO database writes**.
  - Queries `activeDb.user.findMany` for candidate phones.
  - Flags existing accounts as `'EXISTING_IN_DB'` and intra-file duplicates as `'DUPLICATE_IN_FILE'`.
  - Computes counts: `totalRows`, `validCount`, `duplicateInFileCount`, `existingInDbCount`, `invalidFormatCount`.
  - Caps preview grid at 50 rows while returning accurate full counts and errors.
- **`executeBulkImport(fileBuffer, options, actor, ip, ua, db, slug)`:**
  - Re-validates spreadsheet buffer from scratch (zero trust in earlier preview).
  - Skips existing numbers and intra-file duplicates.
  - Hashes random 256-bit dummy passwords with Argon2id.
  - Inserts `User` (`role: MEMBER`, `status: PENDING`, `isPhoneVerified: false`) + `Profile` atomically in chunks of 50.
  - Handles concurrent `P2002` collisions by falling back to row-level isolation and recording as skips.
  - Creates an immutable `AuditLog` entry in the active tenant database (`action: 'USER_BULK_IMPORT'`).

### D. Admin Import Controller (`apps/api/src/modules/admin/users/admin.import.controller.ts`)
- `downloadTemplateHandler`: sets `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="ApnaSamaj_Member_Import_Template.xlsx"`.
- `previewImportHandler`: validates tenant and file, invokes `previewBulkImport`, returns HTTP 200 with `BulkImportPreviewSummary`.
- `executeImportHandler`: validates tenant and file, parses `skipExisting` options, invokes `executeBulkImport`, returns HTTP 200 with `BulkImportExecuteResult`.

### E. Routes Registration (`apps/api/src/modules/admin/users/admin.users.routes.ts`)
- Registered routes with administrative security guards before the parameterized `/:id` route:
  - `GET /api/v1/admin/users/import/template`
  - `POST /api/v1/admin/users/import/preview`
  - `POST /api/v1/admin/users/import/execute`
- Protected by `authenticateToken`, `requireActiveUser`, `requireRoles(SUPER_ADMIN, COMMUNITY_ADMIN)`, and `authorizeAdminCommunitySwitch`.

---

## 3. Verification & Test Results

### 1. Backend Bulk Import Test Suite (`apps/api/src/tests/bulk-import-backend.test.ts`)
```bash
npx tsx apps/api/src/tests/bulk-import-backend.test.ts
```
**Result:** **57 passed, 0 failed**
- Template generation, sheet structure, headers, and instructions.
- Valid XLSX file parsing and phone normalization.
- Rejection of corrupt buffers, oversized files (>5MB), missing headers, duplicate headers, and forbidden columns (`Role`, `Password`, `Status`, `TenantId`, etc.).
- Rejection of unrecognized column headers.
- Safe rejection of formula injection in data cells.
- Intra-file duplicate mobile number detection.
- Dry-run preview verification with **zero database writes**.
- Execution verification: user created with `Role.MEMBER`, `UserStatus.PENDING`, `isPhoneVerified: false`, valid Argon2id dummy hash, atomic Profile creation, and AuditLog creation.
- Missing tenant client rejection with `AdminImportError`.

### 2. Contract & Validation Test Suite (`apps/api/src/tests/bulk-import-contracts.test.ts`)
```bash
npx tsx apps/api/src/tests/bulk-import-contracts.test.ts
```
**Result:** **75 passed, 0 failed**

### 3. Monorepo Typecheck
```bash
npm run typecheck
```
**Result:** **0 errors across all 8 workspace packages** (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`).

### 4. Monorepo Build
```bash
npm run build
```
**Result:** **Clean pass across monorepo** (Prisma generate, Vite production builds for web and admin, TypeScript build for api and packages).

---

## 4. Account Activation Rule & Phase 4 Transition Notice

> [!IMPORTANT]
> **CRITICAL ACCOUNT ACTIVATION INVARIANT:**
> Under the current architecture, `requestPasswordReset` in `auth.service.ts` only issues reset tokens to users with `status: UserStatus.ACTIVE`.  
> In this Phase 3 implementation, imported members are created with `status: UserStatus.PENDING` and `isPhoneVerified: false`, strictly respecting the existing account approval workflow without bypassing security.  
> **Phase 4 Requirement:** Before imported members can claim their accounts via self-service password setup, either:
> 1. An administrator activates their account (`status -> ACTIVE`) through the Admin Panel approval queue; or
> 2. The authentication service is updated to permit members with `status: PENDING` and `isPhoneVerified: false` to claim their account through verified phone OTP verification, automatically transitioning them to `ACTIVE` upon successful password setup.

---

## 5. Modified and Untracked Files

```text
 M apps/api/package.json
 M apps/api/src/modules/admin/index.ts
 M apps/api/src/modules/admin/users/admin.users.routes.ts
 M docs/PROJECT_HISTORY.md
 M package-lock.json
 M packages/shared-types/src/index.ts
 M packages/validation/src/index.ts
?? BATCH_15F_1_EXCEL_IMPORT_CONTRACTS_REPORT.md
?? BATCH_15F_2_BACKEND_BULK_IMPORT_REPORT.md
?? apps/api/src/modules/admin/users/admin.import.controller.ts
?? apps/api/src/modules/admin/users/admin.import.service.ts
?? apps/api/src/modules/admin/users/excel.service.ts
?? apps/api/src/modules/admin/users/excel.upload.ts
?? apps/api/src/tests/bulk-import-backend.test.ts
?? apps/api/src/tests/bulk-import-contracts.test.ts
?? packages/shared-types/src/bulk-import.ts
?? packages/validation/src/bulk-import.ts
```

