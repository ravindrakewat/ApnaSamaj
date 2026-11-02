# BATCH 15F.3 REPORT: Account Activation / Claiming Alignment

**Project:** Apna Samaj Monorepo  
**Batch ID:** 15F.3  
**Feature:** Self-Service Account Claiming & Password Setup for Bulk-Imported Members  
**Execution Date:** November 02, 2026  
**Status:** ✅ Complete, Fully Verified, Zero Secrets Exposed, Uncommitted (Pending User Approval)

---

## 1. Executive Summary

Batch 15F.3 closes the security and activation loop for members imported through the Excel Bulk Member Import pipeline established in Batch 15F.1 and Batch 15F.2.

Imported members are provisioned into the database with `status: PENDING`, `isPhoneVerified: false`, `role: MEMBER`, zero session tokens (`refreshTokens: 0`), and a cryptographically random Argon2id dummy password hash. Prior to this batch, the existing `requestPasswordReset` flow strictly required `status === ACTIVE`, preventing imported members from claiming their accounts without manual administrator activation.

Batch 15F.3 introduces an airtight, dedicated, self-service account-claiming and password-setup subsystem that allows imported members to verify ownership of their mobile phone number via an SMS one-time password (OTP), establish their personal password with Argon2id, and transition atomically to `status: ACTIVE` and `isPhoneVerified: true` with full audit trail tracking.

---

## 2. Security Architecture & Invariants Enforced

1. **Airtight Eligibility Boundary (Zero Schema Migrations):**
   - The claim system strictly verifies that an account has:
     - `status === PENDING`
     - `role === MEMBER`
     - `isPhoneVerified === false`
     - `_count.refreshTokens === 0`
   - Normal self-registered users who registered via `/api/v1/auth/register` possess active refresh token records created at registration (`refreshTokens > 0`) and already possess a known password; their accounts strictly require manual administrator approval and **cannot** bypass approval through this claiming flow.
   - Non-MEMBER accounts (`ADMIN`, `SUPER_ADMIN`) and already `ACTIVE`, `SUSPENDED`, or `REJECTED` accounts are strictly excluded.

2. **Complete Anti-Enumeration Protection:**
   - Both `/claim-account/request` and `/claim-account/verify` return generic, uniform responses for non-existent numbers, active members, suspended members, and ordinary pending registrations.
   - HTTP 200 is always returned on request: `"If an eligible account is associated with this mobile number, an activation code has been sent."`
   - Zero leakage of whether an account exists, is active, or is suspended.

3. **Cryptographic Protection of OTPs at Rest:**
   - 6-digit numeric OTPs are generated using `crypto.randomInt(100000, 1000000)`.
   - Raw OTPs are **never stored** in the database.
   - Database persists a salted SHA-256 hash: `sha256("CLAIM_OTP:" + userId + ":" + otp.trim())`.
   - The user UUID salt guarantees immunity against precomputation and rainbow-table attacks across 6-digit numbers.

4. **Attempt-Limiting & Token Burning:**
   - Strict 5-attempt limit per token record.
   - Upon the 5th failed OTP verification attempt, the token record is immediately invalidated in the database (`usedAt: new Date()`) and cannot be used again, even if the correct OTP is subsequently provided.

5. **Atomic Single-Use Consumption & Race Condition Safety:**
   - Token redemption and account activation execute in a single Prisma `$transaction`.
   - Token burning uses a conditional update `updateMany({ where: { id: tokenRecord.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })`.
   - If two verification requests race concurrently, exactly one succeeds (`count === 1`) and the other is safely rejected.

6. **60-Second Cooldown & Rate Limiting:**
   - Repeat claim OTP requests within 60 seconds are silently throttled without dispatching duplicate SMS messages.
   - HTTP IP rate limiter: 5 requests per 15 minutes per IP (`claimOtpRequestIpRateLimiter`).
   - HTTP Phone rate limiter: 3 requests per 15 minutes per normalized phone (`claimOtpRequestPhoneRateLimiter`).
   - Verification rate limiter: 5 verification attempts per 15 minutes per phone/IP (`claimOtpVerifyRateLimiter`).

7. **Production Fail-Closed SMS Safeguard:**
   - In production (`NODE_ENV === 'production'`), if no real SMS provider credentials (`SMS_API_KEY`, `FAST2SMS_API_KEY`, `MSG91_AUTH_KEY`) are present, the system fails closed: zero tokens are created in the database and zero OTPs are logged.

8. **Audit Logging & Tenant Isolation:**
   - Upon successful activation, an immutable `AuditLog` entry is generated with `action: 'ACCOUNT_CLAIM_AND_ACTIVATE'`, recording `actorId: user.id`, `targetId: user.id`, `ipAddress`, and `userAgent`.
   - All operations are strictly tenant-scoped via `assertDb(req.db)`. Central admin access and requests lacking tenant resolution are rejected with HTTP 400.

---

## 3. Files Created & Modified

| File | Change Type | Description |
|:---|:---|:---|
| `packages/shared-types/src/auth.ts` | Modified | Added `ClaimAccountRequest`, `ClaimAccountVerifyRequest`, `ClaimAccountResponseData` interfaces. |
| `packages/validation/src/auth.ts` | Modified | Added `claimAccountRequestSchema` and `claimAccountVerifySchema` with 6-digit regex and 8-character password constraint. |
| `apps/api/src/modules/auth/auth.tokens.ts` | Modified | Added `generateClaimOtp()`, `calculateClaimOtpExpiry()` (10 min), and `hashClaimOtp(userId, otp)`. |
| `apps/api/src/modules/auth/auth.delivery.ts` | Modified | Added `IClaimOtpDeliveryService` interface, `ConsoleClaimOtpDeliveryAdapter`, `SmsClaimOtpDeliveryAdapter` (fail-closed in prod), and `MockClaimOtpDeliveryAdapter`. |
| `apps/api/src/middleware/rate-limiter.ts` | Modified | Added `claimOtpRequestIpRateLimiter`, `claimOtpRequestPhoneRateLimiter`, and `claimOtpVerifyRateLimiter`. |
| `apps/api/src/modules/auth/auth.service.ts` | Modified | Implemented `requestAccountClaimOtp()`, `verifyClaimOtpAndSetPassword()`, `InvalidClaimError`, cooldown checks, attempt tracking, and atomic activation. |
| `apps/api/src/modules/auth/auth.controller.ts` | Modified | Added `requestClaimOtpHandler` and `verifyClaimOtpHandler` with tenant enforcement and anti-enumeration. |
| `apps/api/src/modules/auth/auth.routes.ts` | Modified | Mounted `/claim-account/request` and `/claim-account/verify` with dedicated rate limiters. |
| `apps/api/src/tests/account-claiming.test.ts` | Created | Comprehensive verification suite covering all 17 requirements with 72 automated assertions. |

---

## 4. Verification & Test Results

### 4.1 Account Claiming Verification Suite (`apps/api/src/tests/account-claiming.test.ts`)
```text
================================================================
   Apna Samaj — Batch 15F.3 Account Claiming Verification Suite 
================================================================

✅ [TEST-01A] PASS: Eligible claim request returns success: true
✅ [TEST-01B] PASS: Eligible claim request delivers OTP
✅ [TEST-01C] PASS: Mock delivery adapter received payload
✅ [TEST-01D] PASS: Delivery phone is normalized
✅ [TEST-01E] PASS: Generated OTP is a 6-digit numeric string
✅ [TEST-01F] PASS: Stored exactly 1 token record in database
✅ [TEST-01G] PASS: Database contains salted SHA-256 hash of OTP
✅ [TEST-01H] PASS: Token record is unused
✅ [TEST-01I] PASS: Token record has future expiration date
✅ [TEST-02A] PASS: Anti-enumeration: Unknown phone returns success: true
✅ [TEST-02B] PASS: Anti-enumeration: Unknown phone does not deliver OTP
✅ [TEST-02C] PASS: No OTP delivered for unknown phone
✅ [TEST-02D] PASS: No token created in database for unknown phone
✅ [TEST-03A] PASS: Anti-enumeration: Active user returns success: true
✅ [TEST-03B] PASS: Anti-enumeration: Active user does not deliver claim OTP
✅ [TEST-03C] PASS: No claim token created for active user
✅ [TEST-04A] PASS: Anti-enumeration: Suspended user returns success: true
✅ [TEST-04B] PASS: Anti-enumeration: Suspended user does not deliver claim OTP
✅ [TEST-04C] PASS: No claim token created for suspended user
✅ [TEST-05A] PASS: Self-registered user receives generic anti-enumeration response
✅ [TEST-05B] PASS: Self-registered user cannot bypass admin approval via claim OTP
✅ [TEST-05C] PASS: No claim token created for self-registered pending member
✅ [TEST-06A] PASS: First request succeeds and delivers OTP
✅ [TEST-06B] PASS: First request creates token
✅ [TEST-06C] PASS: Second request returns success: true
✅ [TEST-06D] PASS: Second request blocked by 60s cooldown
✅ [TEST-06E] PASS: No new OTP sent during cooldown
✅ [TEST-06F] PASS: No additional token created during cooldown
✅ [TEST-07A] PASS: Wrong OTP throws InvalidClaimError
✅ [TEST-07B] PASS: Error message is "Invalid verification code."
✅ [TEST-08A] PASS: Token initially unused
✅ [TEST-08B-1] PASS: Attempt 1 rejected
✅ [TEST-08B-2] PASS: Attempt 2 rejected
✅ [TEST-08B-3] PASS: Attempt 3 rejected
✅ [TEST-08B-4] PASS: Attempt 4 rejected
✅ [TEST-08C] PASS: Token still active after 4 attempts
✅ [TEST-08D] PASS: 5th attempt throws invalidation error
✅ [TEST-08E] PASS: Token record burned (usedAt set) in database
✅ [TEST-08F] PASS: Subsequent attempt fails on burned token
✅ [TEST-09A] PASS: Expired token throws InvalidClaimError
✅ [TEST-09B] PASS: Error message identifies token as expired
✅ [TEST-10A] PASS: Member status transitioned to ACTIVE
✅ [TEST-10B] PASS: Member isPhoneVerified is true
✅ [TEST-10C] PASS: New password verified with Argon2id hash
✅ [TEST-10D] PASS: Claim token marked as used in database
✅ [TEST-10E] PASS: Audit log record created
✅ [TEST-10F] PASS: Audit action matches
✅ [TEST-10G] PASS: Audit actorId is user ID
✅ [TEST-10H] PASS: Audit targetId is user ID
✅ [TEST-10I] PASS: Audit IP address recorded
✅ [TEST-11A] PASS: Reusing consumed OTP fails
✅ [TEST-12A] PASS: Password < 8 chars throws AuthError
✅ [TEST-12B] PASS: Password error has HTTP 400 status
✅ [TEST-13A] PASS: Request OTP without db throws AuthError
✅ [TEST-13B] PASS: Missing tenant db has HTTP 500 status
✅ [TEST-13C] PASS: Verify OTP without db throws AuthError
✅ [TEST-14A] PASS: Production fail-closed returns generic success: true
✅ [TEST-14B] PASS: Production fail-closed does not deliver OTP
✅ [TEST-14C] PASS: No token created in production without SMS provider
✅ [TEST-15A] PASS: Controller rejects request missing tenant context with 400
✅ [TEST-15B] PASS: Controller rejects central admin claim requests with 400
✅ [TEST-15C] PASS: Controller returns 200 for valid claim request
✅ [TEST-15D] PASS: Response indicates success: true
✅ [TEST-15E] PASS: Response has generic message
✅ [TEST-16A] PASS: Controller rejects non-6-digit OTP format with 400
✅ [TEST-16B] PASS: Controller returns 200 on successful claim verification
✅ [TEST-16C] PASS: Response indicates success: true
✅ [TEST-16D] PASS: Response data has claimed: true
✅ [TEST-16E] PASS: User status is now ACTIVE
✅ [TEST-16F] PASS: User isPhoneVerified is true
✅ [TEST-17A] PASS: Exactly one concurrent verification succeeds
✅ [TEST-17B] PASS: Exactly one concurrent verification is rejected

================================================================
   Verification Complete: 72 Passed, 0 Failed
================================================================
```

### 4.2 Monorepo Regression Suites
- `apps/api/src/tests/bulk-import-backend.test.ts`: **57 / 57 PASS**
- `apps/api/src/tests/bulk-import-contracts.test.ts`: **75 / 75 PASS**
- `apps/api/src/tests/auth-password-reset.test.ts`: **18 / 18 PASS**
- `npm run typecheck`: **Clean across all 8 workspaces** (`@apnasamaj/admin`, `@apnasamaj/api`, `@apnasamaj/web`, `@apnasamaj/database`, `@apnasamaj/i18n`, `@apnasamaj/shared-types`, `@apnasamaj/ui-config`, `@apnasamaj/validation`).
- `npm run build`: **Clean across all 8 workspaces**.

---

## 5. Security & Invariant Checklist

- [x] Multi-tenant isolation verified with `assertDb(req.db)`.
- [x] Central admin access rejected with HTTP 400.
- [x] Zero plain text passwords or default passwords.
- [x] Zero plain text OTPs stored in database.
- [x] Salted SHA-256 OTP hashes using unique user ID salt.
- [x] Argon2id password hashing for new passwords.
- [x] Single-use atomic token burning with race condition prevention.
- [x] 5-attempt limit per token record with automatic burning.
- [x] 60-second cooldown per account on OTP dispatch.
- [x] Anti-enumeration returns identical HTTP 200 responses.
- [x] Production mode fails closed when SMS credentials are not configured.
- [x] Self-registered users awaiting admin approval cannot claim or bypass approval.
- [x] Suspended users cannot claim accounts.
- [x] Zero database migrations required.
- [x] Working tree preserved without uncommitted deletions or discards.

