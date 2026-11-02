# Batch 15F.1 — Excel Bulk Member Import: Contract Types, Validation Schemas & Dependency Preparation

**Date:** 2026-11-01  
**Batch ID:** Batch 15F.1  
**Scope:** Phase 2 of Excel Bulk Member Import with Self-Service Password Setup  
**Repository:** `ravindrakewat/ApnaSamaj`  
**Git Branch:** `main`  
**Commit Baseline:** `eb3e639c757e86f9beceb6ecd76e5aaf1f03d4c0` (HEAD)  
**Execution Mode:** Uncommitted working tree modifications (Awaiting explicit user review before committing/pushing).

---

## 1. Executive Summary

In accordance with the architecture audit and Phase 2 requirements for the Excel Bulk Member Import project, this batch establishes the contract definitions, reusable Zod validation schemas, security boundary enforcement, and Excel processing runtime dependency.

All modifications strictly preserve Apna Samaj multi-tenant invariants:
- **No security field injection:** Spreadsheet rows cannot supply `role`, `password`, `status`, or tenant identifiers (`tenantId`, `communitySlug`, `db`). Attempts to supply them are strictly rejected.
- **Canonical phone normalization:** All phone inputs (including raw numeric cells from Excel) are coerced and normalized to Indian E.164 (`+91XXXXXXXXXX`) using the established `@apnasamaj/validation` normalization utility.
- **Decoupled shared contracts:** Frontend and backend contracts are centralized in `@apnasamaj/shared-types`.
- **Zero database alterations:** No Prisma schema changes or migrations were made.
- **Comprehensive test coverage:** 75 focused validation and contract assertions pass cleanly in `apps/api/src/tests/bulk-import-contracts.test.ts`.
- **Zero build regressions:** All 8 workspace packages in the monorepo pass typechecking (`npm run typecheck`) and production build (`npm run build`).

---

## 2. Changes Implemented

### A. Dependency Preparation (`apps/api/package.json`)
- Added `exceljs` (`^4.4.0`) to `apps/api/package.json`.
- Verified that `exceljs` provides built-in TypeScript declarations directly (`index.d.ts`), avoiding deprecated stub packages (`@types/exceljs`).
- Clean installation verified via `npm install exceljs --workspace=@apnasamaj/api`.

### B. Shared Bulk Import DTOs (`packages/shared-types/src/bulk-import.ts`)
- Added strongly typed models exported through `packages/shared-types/src/index.ts`:
  - `BulkImportMemberRow`: Decoupled representation of an individual imported member (`fullName`, `phone`, `gender?`, `city?`, `state?`, `subCaste?`, `gotra?`).
  - `BulkImportRowStatus`: Enum-like union `'VALID' | 'DUPLICATE_IN_FILE' | 'EXISTING_IN_DB' | 'INVALID_FORMAT'`.
  - `BulkImportRowError`: Detailed error reporting (`rowNumber`, `field`, `value?`, `message`).
  - `BulkImportPreviewRow`: Row model for admin UI preview table.
  - `BulkImportPreviewSummary`: Overall dry-run stats (`totalRows`, `validCount`, `duplicateInFileCount`, `existingInDbCount`, `invalidFormatCount`, `previewRows`, `errors`).
  - `BulkImportExecuteOptions`: Options controlling duplicate skipping (`skipExisting`).
  - `BulkImportExecuteResult`: Execution result payload with import and skip metrics.

### C. Reusable Zod Validation Schemas (`packages/validation/src/bulk-import.ts`)
- Added validation and normalization logic exported through `packages/validation/src/index.ts`:
  - `bulkImportPhoneSchema`: Preprocesses numeric or string inputs, trims, converts via `normalizeIndianPhone`, and refines with `/^\+91[6-9]\d{9}$/`.
  - `bulkImportFullNameSchema`: Trims whitespace, enforces 2–100 characters.
  - `bulkImportGenderSchema`: Case-insensitively normalizes `'Male'`, `'male'`, `'M'`, `'Female'`, `'female'`, `'F'`, `'Other'`, `'other'`, `'O'` to standard enum `'MALE' | 'FEMALE' | 'OTHER'`; maps blanks to `null`.
  - `bulkImportCitySchema`, `bulkImportStateSchema`, `bulkImportSubCasteSchema`, `bulkImportGotraSchema`: Trims whitespace, coerces empty strings to `null`, caps at 100 chars.
  - `bulkImportRowSchema`: Strict Zod object disallowing unrecognized extra fields (`.strict()`).
  - `FORBIDDEN_BULK_IMPORT_FIELDS` & `checkForbiddenImportFields`: Explicit check intercepting attempts to inject `role`, `password`, `passwordHash`, `status`, `tenantId`, `tenant`, `community`, `communitySlug`, `db`, `isPhoneVerified`, `id`, `userId`.
  - `validateBulkImportRow`: Top-level validation helper returning clean typed data or detailed row error arrays.

### D. Automated Contract & Validation Tests (`apps/api/src/tests/bulk-import-contracts.test.ts`)
- Implemented comprehensive test suite covering:
  - Complete valid row with all 7 fields.
  - Minimal valid row (only `fullName` and `phone`).
  - 7 phone normalization variants (numeric cells, 10 digits, leading zero, 91 prefix, `+91`, spaces, hyphens).
  - 6 invalid phone rejection scenarios (starting with 1-5, short, long, alphanumeric, empty, null).
  - Full name length and trimming constraints.
  - Gender case-insensitive normalization and invalid gender rejection.
  - Optional string field trimming and max-length bounds.
  - Strict rejection of all 12 forbidden security fields.
  - Rejection of unknown arbitrary columns.
  - Execution options parsing and boolean coercion.
  - Intra-file duplicate detection tracking contracts.

---

## 3. Verification & Test Results

### 1. Contract & Validation Test Suite
```bash
npx tsx apps/api/src/tests/bulk-import-contracts.test.ts
```
**Result:** 75 passed, 0 failed.

### 2. Monorepo Typecheck
```bash
npm run typecheck
```
**Result:** Pass (0 errors across `@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`).

### 3. Monorepo Build
```bash
npm run build
```
**Result:** Pass (Prisma client generated, Vite production builds for web and admin succeeded, TypeScript builds for all packages succeeded).

---

## 4. Modified & Untracked Files

```text
 M apps/api/package.json
 M package-lock.json
 M packages/shared-types/src/index.ts
 M packages/validation/src/index.ts
?? apps/api/src/tests/bulk-import-contracts.test.ts
?? packages/shared-types/src/bulk-import.ts
?? packages/validation/src/bulk-import.ts
?? BATCH_15F_1_EXCEL_IMPORT_CONTRACTS_REPORT.md
```

---

## 5. Next Recommended Step: Phase 3
- Implement Backend Importer Service (`apps/api/src/modules/admin/users/admin.import.service.ts`):
  - `generateImportTemplate`: creates formatted `.xlsx` buffer with instructions and dropdowns.
  - `previewBulkImport`: parses uploaded `.xlsx` buffer, runs validations, queries tenant DB for existing members, returns dry-run summary.
  - `executeBulkImport`: runs transactional batch inserts into tenant DB, sets secure random dummy password hashes, creates Profile records, logs to `AuditLog`.
- Register admin routes:
  - `GET /api/v1/admin/users/import/template`
  - `POST /api/v1/admin/users/import/preview`
  - `POST /api/v1/admin/users/import/execute`

