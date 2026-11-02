# BATCH 15F.4 REPORT: Admin Bulk Member Import UI + Member Account Claim Flow

**Project:** Apna Samaj Monorepo  
**Batch ID:** 15F.4  
**Feature:** Admin Panel Bulk Import Dialog & Member Portal Account Claiming Flow  
**Execution Date:** November 02, 2026  
**Status:** ✅ Complete, Fully Verified, Zero Secrets Exposed, Uncommitted (Pending User Approval)

---

## 1. Executive Summary

Batch 15F.4 delivers the complete user-facing frontend experience for both administrators and community members, seamlessly consuming the robust contracts, Excel backend services, and account claiming endpoints engineered across Batches 15F.1, 15F.2, and 15F.3:

1. **Admin Panel — Excel Bulk Member Import Dialog (`apps/admin`):**
   - Implemented a 3-step import wizard dialog (`BulkImportDialog.tsx`) within `MemberManagementPage.tsx`.
   - Enables community administrators and super admins to download the pre-formatted Excel template (`generateImportTemplate()`), select an `.xlsx` file with client-side type and size validation (5 MB limit), dry-run preview rows with live summary chips (Total, Valid, Existing, Duplicate), inspect row-level validation errors, export problem rows as formula-injection-safe CSV files, and execute bulk member creation.
   - Enforced client-side role guards restricting import actions strictly to `SUPER_ADMIN` and `COMMUNITY_ADMIN` roles while maintaining multi-tenant header isolation (`x-community-slug`).

2. **Member Portal — Self-Service Account Claiming Flow (`apps/web`):**
   - Implemented a bilingual (`/claim-account`) page in Hindi and English with full i18n integration.
   - Built a secure two-step claiming workflow: (Step 1) Mobile number input with normalization and 60-second OTP cooldown timer; (Step 2) 6-digit OTP verification with new password creation and matching confirmation.
   - Enforced strict non-persistence: OTPs and plaintext passwords reside exclusively in volatile React component state and are never written to `localStorage`, `sessionStorage`, or console logs.
   - Direct link added to `LoginPage.tsx` allowing bulk-imported members to claim their profiles self-service.

---

## 2. Security Architecture & Invariants Enforced

1. **CSV Formula Injection Mitigation (Spreadsheet Defense):**
   - Spreadsheet software (Microsoft Excel, LibreOffice Calc, Google Sheets) interprets cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` as formulas or shell commands (DDE).
   - Created `apps/admin/src/utils/csv-export.ts` with `sanitizeCsvCell()` which detects formula trigger characters and prepends an apostrophe (`'`) to neutralize automatic formula execution while preserving readable text.
   - Quoting and escaping rules properly handle commas and internal quotes (`"` -> `""`).

2. **Volatile Non-Persistent State in Member Portal:**
   - Account claiming handles sensitive transient data (SMS OTP and new user passwords).
   - Components maintain state strictly in React volatile memory. Zero tokens or passwords are saved to browser storage or cached across browser reloads.

3. **Anti-Enumeration Uniformity in Frontend:**
   - In accordance with the backend anti-enumeration guarantees established in Batch 15F.3, the claim request screen always displays a generic status message: *"If an eligible account is associated with this mobile number, an activation code has been sent."*
   - The UI never hints whether a phone number exists, is pending, is active, or is suspended.

4. **Post-Claim Session Hygiene:**
   - The verify claim endpoint (`/api/v1/auth/claim-account/verify`) sets the user password and activates the user record, returning `{ success: true, data: { claimed: true } }` without issuing session tokens.
   - The frontend renders an explicit success state and directs the user to `/login` to perform standard authenticated sign-in.

5. **Client-Side Validation & Guardrails:**
   - File picker restricts uploads to `.xlsx` files under 5 MB.
   - Phone inputs are validated against Indian phone number formats (10 digits starting with 6–9) and normalized before API calls.
   - OTP inputs are strictly restricted to 6 numeric digits.
   - Passwords must meet the minimum 8-character complexity requirement, with client-side confirmation checks before dispatching API requests.

6. **Tenant Context Preservation:**
   - All admin requests pass tenant context via `x-community-slug` and `communityId` parameters.
   - All member portal claim requests include the current community slug to guarantee physical tenant database routing via `assertDb(req.db)`.

---

## 3. Files Created & Modified

| File | Change Type | Description |
|:---|:---|:---|
| `packages/i18n/src/locales/en/auth.json` | Modified | Added English translation keys for account claiming flow and login link. |
| `packages/i18n/src/locales/hi/auth.json` | Modified | Added Hindi translation keys for account claiming flow and login link. |
| `apps/admin/src/utils/csv-export.ts` | Created | Safe CSV serializer with formula-injection neutralization (`'`, `=`, `+`, `-`, `@`) and browser download trigger. |
| `apps/admin/src/services/admin.users.service.ts` | Modified | Added `downloadImportTemplate()`, `previewBulkImportApi()`, and `executeBulkImportApi()` service methods with blob and multipart/form-data handling. |
| `apps/admin/src/components/BulkImportDialog.tsx` | Created | Comprehensive 3-step import wizard (Template download, file picker, preview table, error CSV export, and execution results). |
| `apps/admin/src/pages/MemberManagementPage.tsx` | Modified | Added role-guarded "Import Members" button (`SUPER_ADMIN` and `COMMUNITY_ADMIN` only) and BulkImportDialog mount. |
| `apps/admin/src/tests/bulk-import-dialog-ux.test.ts` | Created | 43 UX and security tests verifying template handling, file validation, preview parsing, formula sanitization, and role checks. |
| `apps/web/src/services/auth.service.ts` | Modified | Added `requestClaimOtpApi()` and `verifyClaimOtpApi()` client methods. |
| `apps/web/src/pages/ClaimAccountPage.tsx` | Created | Responsive bilingual claim page with OTP request cooldown (60s), OTP verification, password setup, and error handling. |
| `apps/web/src/pages/LoginPage.tsx` | Modified | Added "Claim Account" navigation link for bulk-imported members. |
| `apps/web/src/App.tsx` | Modified | Mounted `/claim-account` route in application routing hierarchy. |
| `apps/web/src/tests/claim-account-ux.test.ts` | Created | 54 UX, security, anti-enumeration, non-persistence, and i18n tests for member claim flow. |

---

## 4. Verification & Test Results

### 4.1 Admin Bulk Import Dialog UX Test Suite (`apps/admin/src/tests/bulk-import-dialog-ux.test.ts`)
```text
================================================================
   Apna Samaj — Batch 15F.4: Admin Bulk Import Dialog UX Tests   
================================================================

✅ [TEST-01A] PASS: Parses quoted filename from Content-Disposition header
✅ [TEST-01B] PASS: Parses unquoted filename from Content-Disposition header
✅ [TEST-01C] PASS: Fallback template filename has correct .xlsx extension
✅ [TEST-02A] PASS: Valid .xlsx file accepted
✅ [TEST-02B] PASS: Case-insensitive .xlsx accepted
✅ [TEST-02C] PASS: CSV file rejected
✅ [TEST-02D] PASS: Legacy .xls rejected
✅ [TEST-02E] PASS: Executable rejected
✅ [TEST-02F] PASS: 50 KB file accepted
✅ [TEST-02G] PASS: Exactly 5 MB file accepted
✅ [TEST-02H] PASS: File over 5 MB rejected
✅ [TEST-02I] PASS: Formats bytes
✅ [TEST-02J] PASS: Formats kilobytes
✅ [TEST-02K] PASS: Formats megabytes
✅ [TEST-03A] PASS: Summary reflects 4 total rows
✅ [TEST-03B] PASS: Summary reflects 2 valid rows
✅ [TEST-03C] PASS: Summary reflects 1 existing row
✅ [TEST-03D] PASS: Summary reflects 1 duplicate row
✅ [TEST-03E] PASS: Valid row identified
✅ [TEST-03F] PASS: Duplicate row contains clear error description
✅ [TEST-03G] PASS: Existing account row contains clear skip explanation
✅ [TEST-04A] PASS: Prefixes = with single quote
✅ [TEST-04B] PASS: Prefixes + with single quote
✅ [TEST-04C] PASS: Prefixes - with single quote
✅ [TEST-04D] PASS: Prefixes @ with single quote
✅ [TEST-04E] PASS: Leaves safe text unmodified
✅ [TEST-04F] PASS: Wraps comma-containing values in quotes
✅ [TEST-04G] PASS: Doubles internal quotation marks
✅ [TEST-04H] PASS: CSV header contains expected standard columns
✅ [TEST-04I] PASS: CSV contains 2 problem row entries + header
✅ [TEST-04J] PASS: Phone with plus prefix is sanitized with single quote to prevent spreadsheet addition formula
✅ [TEST-04K] PASS: Error report CSV never exposes password hashes or tokens
✅ [TEST-05A] PASS: Import button disabled when validCount is 0
✅ [TEST-05B] PASS: Import button enabled when validCount > 0
✅ [TEST-05C] PASS: Results view displays 2 imported members
✅ [TEST-05D] PASS: Results view displays 1 skipped existing
✅ [TEST-05E] PASS: Results view displays 1 skipped duplicate
✅ [TEST-05F] PASS: Results view displays 0 failures
✅ [TEST-06A] PASS: SUPER_ADMIN is authorized to import
✅ [TEST-06B] PASS: COMMUNITY_ADMIN is authorized to import
✅ [TEST-06C] PASS: MODERATOR is forbidden from importing
✅ [TEST-06D] PASS: MEMBER is forbidden from importing
✅ [TEST-06E] PASS: Unauthenticated user is forbidden from importing

================================================================
   Verification Complete: 43 Passed, 0 Failed
================================================================
```

### 4.2 Member Claim Account UX Test Suite (`apps/web/src/tests/claim-account-ux.test.ts`)
```text
================================================================
   Apna Samaj — Batch 15F.4: Member Claim Account Frontend UX   
================================================================

✅ [TEST-01A] PASS: Valid 10-digit Indian phone is accepted
✅ [TEST-01B] PASS: Phone is normalized to E.164 (+91XXXXXXXXXX)
✅ [TEST-01C] PASS: Formatted phone with spaces is normalized
✅ [TEST-01D] PASS: Formatted phone matches expected E.164
✅ [TEST-01E] PASS: Leading zero format is normalized
✅ [TEST-01F] PASS: Short phone (<10 digits) is rejected
✅ [TEST-01G] PASS: Alphanumeric phone is rejected
✅ [TEST-01H] PASS: Phone starting with < 6 is rejected
✅ [TEST-02A] PASS: ClaimAccountRequest schema validates payload
✅ [TEST-02B] PASS: Payload phone normalized for API dispatch
✅ [TEST-02C] PASS: Frontend presents generic anti-enumeration response to user
✅ [TEST-02D] PASS: Response message does not leak internal role or activation status
✅ [TEST-03A] PASS: Resend button disabled during active 60s cooldown
✅ [TEST-03B] PASS: Cooldown countdown reflects remaining seconds
✅ [TEST-03C] PASS: Resend button re-enabled once cooldown reaches 0
✅ [TEST-04A] PASS: Valid 6-digit OTP and password accepted by schema
✅ [TEST-04B] PASS: 5-digit OTP rejected (must be 6 digits)
✅ [TEST-04C] PASS: Non-numeric OTP rejected
✅ [TEST-05A] PASS: Password < 8 characters rejected
✅ [TEST-05B] PASS: Password mismatch detected client-side before submission
✅ [TEST-05C] PASS: Matching passwords pass client-side confirmation check
✅ [TEST-06A] PASS: Claim verification succeeds
✅ [TEST-06B] PASS: Server response confirms claimed: true
✅ [TEST-06C] PASS: Claim endpoint does not issue session tokens (requires explicit login)
✅ [TEST-06D] PASS: OTP is never written to localStorage
✅ [TEST-06E] PASS: Plaintext password is never written to sessionStorage
✅ [TEST-07-EN-claimAccount] PASS: English locale contains 'claimAccount'
✅ [TEST-07-HI-claimAccount] PASS: Hindi locale contains 'claimAccount'
✅ [TEST-07-EN-claimTitle] PASS: English locale contains 'claimTitle'
✅ [TEST-07-HI-claimTitle] PASS: Hindi locale contains 'claimTitle'
✅ [TEST-07-EN-claimSubtitle] PASS: English locale contains 'claimSubtitle'
✅ [TEST-07-HI-claimSubtitle] PASS: Hindi locale contains 'claimSubtitle'
✅ [TEST-07-EN-requestOtpButton] PASS: English locale contains 'requestOtpButton'
✅ [TEST-07-HI-requestOtpButton] PASS: Hindi locale contains 'requestOtpButton'
✅ [TEST-07-EN-resendOtpIn] PASS: English locale contains 'resendOtpIn'
✅ [TEST-07-HI-resendOtpIn] PASS: Hindi locale contains 'resendOtpIn'
✅ [TEST-07-EN-enterOtp] PASS: English locale contains 'enterOtp'
✅ [TEST-07-HI-enterOtp] PASS: Hindi locale contains 'enterOtp'
✅ [TEST-07-EN-otpHelperText] PASS: English locale contains 'otpHelperText'
✅ [TEST-07-HI-otpHelperText] PASS: Hindi locale contains 'otpHelperText'
✅ [TEST-07-EN-newPassword] PASS: English locale contains 'newPassword'
✅ [TEST-07-HI-newPassword] PASS: Hindi locale contains 'newPassword'
✅ [TEST-07-EN-confirmPassword] PASS: English locale contains 'confirmPassword'
✅ [TEST-07-HI-confirmPassword] PASS: Hindi locale contains 'confirmPassword'
✅ [TEST-07-EN-claimButton] PASS: English locale contains 'claimButton'
✅ [TEST-07-HI-claimButton] PASS: Hindi locale contains 'claimButton'
✅ [TEST-07-EN-claimSuccessTitle] PASS: English locale contains 'claimSuccessTitle'
✅ [TEST-07-HI-claimSuccessTitle] PASS: Hindi locale contains 'claimSuccessTitle'
✅ [TEST-07-EN-claimSuccessMessage] PASS: English locale contains 'claimSuccessMessage'
✅ [TEST-07-HI-claimSuccessMessage] PASS: Hindi locale contains 'claimSuccessMessage'
✅ [TEST-07-EN-goToLogin] PASS: English locale contains 'goToLogin'
✅ [TEST-07-HI-goToLogin] PASS: Hindi locale contains 'goToLogin'
✅ [TEST-07-EN-claimAccountLink] PASS: English locale contains 'claimAccountLink'
✅ [TEST-07-HI-claimAccountLink] PASS: Hindi locale contains 'claimAccountLink'

================================================================
   Verification Complete: 54 Passed, 0 Failed
================================================================
```

### 4.3 Monorepo Full Test & Build Suite Summary
| Suite / Command | Scope | Passing Assertions / Status |
|:---|:---|:---|
| `bulk-import-contracts.test.ts` | Shared Types & Zod Schemas | **75 / 75 PASS** |
| `bulk-import-backend.test.ts` | Excel Template, Parser & Import Service | **57 / 57 PASS** |
| `account-claiming.test.ts` | OTP Tokens, SMS Adapters & Service | **72 / 72 PASS** |
| `bulk-import-dialog-ux.test.ts` | Admin Dialog, Sanitization & Role Guards | **43 / 43 PASS** |
| `claim-account-ux.test.ts` | Member Portal UX, Cooldown & Security | **54 / 54 PASS** |
| **Total Automated Assertions** | **5 Test Suites Across Monorepo** | **301 / 301 PASS (100%)** |
| `npm run typecheck` | All 8 Monorepo Workspaces | **0 Errors (Exit code 0)** |
| `npm run build -w @apnasamaj/admin` | Vite Admin Production Build | **Success (Exit code 0)** |
| `npm run build -w @apnasamaj/web` | Vite Web Production Build | **Success (Exit code 0)** |

---

## 5. Multi-Tenant Architectural Audit & Invariants

1. **Explicit Tenant Context:** Both the Admin Dialog and Member Claim page pass tenant context explicitly (`x-community-slug` / `communitySlug`).
2. **Tenant-Scoped DB Only:** All server operations execute via `req.db` and are guarded with `assertDb(req.db)`. Requests lacking tenant context fail closed with HTTP 400.
3. **No Default Fallbacks:** No fallback to a default or central database occurs.
4. **SUPER_ADMIN Boundaries:** Role verification for `SUPER_ADMIN` in the admin UI merely enables the dialog; physical database queries execute strictly inside the resolved tenant database context.
5. **Zero Sensitive Data Exposure:** Password hashes, reset tokens, OTPs, and private contact info are never returned in preview responses, CSV error reports, or verification responses.

---

## 6. Recommended Next Batch

- **Batch 15F.5 — End-to-End Staging Verification & Pre-Commit Checkpoint Audit:**
  - Execute end-to-end multi-tenant validation on staging with realistic `.xlsx` import data.
  - Review all modified and untracked files across Batches 15F.1, 15F.2, 15F.3, and 15F.4.
  - Prepare staging allowlist and await explicit user instruction before staging or committing changes.

