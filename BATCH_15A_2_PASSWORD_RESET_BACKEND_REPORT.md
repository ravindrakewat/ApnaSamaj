# Batch 15A.2: Password Reset Backend Implementation Report

**Project:** Apna Samaj Monorepo  
**Batch:** 15A.2  
**Date:** 2026-10-30  
**Status:** Completed & Verified  

---

## 1. Executive Summary

In Batch 15A.2, we implemented complete, production-grade, tenant-aware, self-service password reset APIs for the Apna Samaj platform.

### Key Highlights
- **Zero Schema Migrations:** Leveraged the existing PostgreSQL `PasswordResetToken` table and Prisma schema without modifying columns or running migrations.
- **Strict Single-Use Concurrency Safety:** Used PostgreSQL atomic conditional update (`updateMany` with `usedAt: null` filter inside a Prisma interactive transaction) ensuring that concurrent redemption attempts cannot race or double-spend tokens.
- **Fail-Closed Production Safety:** Implemented `ConsoleResetDeliveryAdapter` for development/staging and `SmsResetDeliveryAdapter` for production. In `production`, if SMS configuration is missing, the backend fails closed by creating zero usable tokens in the database while returning an identical generic HTTP 200 response to prevent enumeration.
- **Tenant Boundary Isolation:** All operations enforce active community tenant routing via `req.communityDb`. Requests without tenant context fail closed with HTTP 400.
- **Argon2id Hashing:** Standardized password hashing using Argon2id with project-standard parameters (64 MB memory, 3 iterations, 1 parallelism).
- **Anti-Enumeration Protection:** `POST /forgot-password` returns an identical HTTP 200 response regardless of whether the mobile number exists, does not exist, or belongs to a suspended account.
- **Full Test Verification:** 18 out of 18 test cases passed in [`apps/api/src/tests/auth-password-reset.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/auth-password-reset.test.ts), all existing regression test suites passed (database, tenant auth, appeals), and workspace-wide typechecking and production builds succeeded with zero errors.

---

## 2. Inventory of Modified and Created Files

| File | Change Type | Purpose |
| :--- | :--- | :--- |
| [`packages/validation/src/auth.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/validation/src/auth.ts) | Modified | Added Zod validation schemas: `forgotPasswordSchema`, `verifyResetTokenSchema`, `resetPasswordSchema` and inferred TypeScript types. |
| [`packages/shared-types/src/auth.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/shared-types/src/auth.ts) | Modified | Added DTO types: `ForgotPasswordRequest`, `VerifyResetTokenRequest`, `VerifyResetTokenResponseData`, `ResetPasswordRequest`. |
| [`apps/api/src/modules/auth/auth.delivery.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/auth/auth.delivery.ts) | Created | Delivery adapter abstraction (`IResetDeliveryService`, `ConsoleResetDeliveryAdapter`, `SmsResetDeliveryAdapter`, factory `getResetDeliveryService`). |
| [`apps/api/src/modules/auth/auth.tokens.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/auth/auth.tokens.ts) | Modified | Added `generatePasswordResetToken()` (32 bytes cryptographically secure entropy) and `calculatePasswordResetTokenExpiry()` (15-minute lifetime). |
| [`apps/api/src/modules/auth/auth.password.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/auth/auth.password.ts) | Modified | Exported `hashPassword(plainText: string)` utilizing `argon2.hash` with project standard Argon2id parameters. |
| [`apps/api/src/modules/auth/auth.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/auth/auth.service.ts) | Modified | Implemented `requestPasswordReset`, `verifyResetToken`, `resetPassword`, and `InvalidResetTokenError`. |
| [`apps/api/src/middleware/rate-limiter.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/middleware/rate-limiter.ts) | Modified | Configured IP and phone rate limiters: `forgotPasswordIpRateLimiter`, `forgotPasswordPhoneRateLimiter`, `verifyResetTokenRateLimiter`, `resetPasswordRateLimiter`. |
| [`apps/api/src/modules/auth/auth.controller.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/auth/auth.controller.ts) | Modified | Implemented route controllers: `forgotPasswordHandler`, `verifyResetTokenHandler`, `resetPasswordHandler`. |
| [`apps/api/src/modules/auth/auth.routes.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/auth/auth.routes.ts) | Modified | Mounted endpoints with Zod validation and rate limiting middleware. |
| [`apps/api/src/modules/auth/index.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/auth/index.ts) | Modified | Exported `auth.delivery`. |
| [`apps/api/src/tests/auth-password-reset.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/auth-password-reset.test.ts) | Created | Comprehensive automated unit/integration test suite covering all 18 test cases. |

---

## 3. API Contracts and Endpoint Specifications

### 1. Request Password Reset
- **Route:** `POST /api/v1/auth/forgot-password`
- **Middleware:** `tenantMiddleware`, `forgotPasswordIpRateLimiter` (5 req / 15m), `forgotPasswordPhoneRateLimiter` (3 req / 15m per normalized phone), `validateBody(forgotPasswordSchema)`.
- **Request Body:**
  ```json
  {
    "phone": "+919876543210"
  }
  ```
- **Validation:** Phone must match regex `/^\+91[6-9]\d{9}$/`.
- **Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "If the account exists and is eligible, password reset instructions have been sent."
  }
  ```
- **Security Behaviors:**
  - Phone numbers without an account return HTTP 200 (anti-enumeration).
  - Suspended accounts (`UserStatus.SUSPENDED`) return HTTP 200 without issuing a reset token (anti-enumeration).
  - Active tokens for the user are immediately marked retired/expired prior to issuing a new token.
  - Fail-closed in production if SMS delivery provider is absent.

### 2. Verify Reset Token Preflight
- **Route:** `POST /api/v1/auth/verify-reset-token`
- **Middleware:** `tenantMiddleware`, `verifyResetTokenRateLimiter` (15 req / 15m), `validateBody(verifyResetTokenSchema)`.
- **Request Body:**
  ```json
  {
    "token": "4f18d7f6c3a2b109876543210abcdef0123456789abcdef0123456789abcdef0"
  }
  ```
- **Validation:** Token must be a 64-character lowercase hex string (`/^[a-f0-9]{64}$/`).
- **Response (HTTP 200 OK — Valid Token):**
  ```json
  {
    "success": true,
    "data": {
      "valid": true,
      "expiresAt": "2026-10-30T09:15:00.000Z"
    }
  }
  ```
- **Response (HTTP 200 OK — Invalid / Expired / Used Token):**
  ```json
  {
    "success": true,
    "data": {
      "valid": false
    }
  }
  ```
- **Security Behaviors:**
  - Compares token via SHA-256 hash lookup.
  - Never exposes user ID, phone number, name, or password hashes to the preflight caller.
  - Returns `valid: false` rather than HTTP 400/404 to avoid leaking database error states.

### 3. Reset Password
- **Route:** `POST /api/v1/auth/reset-password`
- **Middleware:** `tenantMiddleware`, `resetPasswordRateLimiter` (5 req / 15m), `validateBody(resetPasswordSchema)`.
- **Request Body:**
  ```json
  {
    "token": "4f18d7f6c3a2b109876543210abcdef0123456789abcdef0123456789abcdef0",
    "newPassword": "NewStrongPassword123!"
  }
  ```
- **Validation:** 
  - Token: 64-character lowercase hex string.
  - `newPassword`: String between 8 and 100 characters.
- **Response (HTTP 200 OK — Success):**
  ```json
  {
    "success": true,
    "message": "Password has been reset successfully. Please log in with your new password."
  }
  ```
- **Response (HTTP 400 Bad Request — Invalid / Expired / Reused Token):**
  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_RESET_TOKEN",
      "message": "The password reset token is invalid, has expired, or has already been used."
    }
  }
  ```
- **Security Behaviors:**
  - Token is consumed in an atomic database transaction.
  - New password is hashed with Argon2id.
  - All existing user refresh tokens are revoked (`revokedAt = new Date()`), forcing re-authentication across all sessions and devices.
  - Does NOT automatically issue access/refresh tokens; the user must explicitly log in with the new password.

---

## 4. Cryptographic and Concurrency Design

### 1. Token Generation and Storage
- **Entropy:** 32 raw bytes generated using Node.js `crypto.randomBytes(32)` providing 256 bits of cryptographically secure pseudo-random entropy.
- **Encoding:** Hexadecimal format (64 hex characters).
- **Storage:** Only the SHA-256 digest (`crypto.createHash('sha256').update(rawToken).digest('hex')`) is stored in the `PasswordResetToken.tokenHash` column. The raw token is never persisted.
- **Expiration:** Set to exactly 15 minutes (`Date.now() + 15 * 60 * 1000`).

### 2. Atomic Single-Use Concurrency Safety
To prevent double-spend or race conditions where two simultaneous reset requests attempt to consume the same token, the redemption uses a conditional update inside a Prisma interactive transaction:
```typescript
const updateResult = await tx.passwordResetToken.updateMany({
  where: {
    tokenHash,
    usedAt: null,
    expiresAt: { gt: new Date() },
  },
  data: {
    usedAt: new Date(),
  },
});

if (updateResult.count === 0) {
  throw new InvalidResetTokenError();
}
```
Because PostgreSQL evaluates row locks on update, exactly one transaction will match the criteria `usedAt: null` and receive `count: 1`. Any racing transaction will find `count: 0` and abort immediately with `InvalidResetTokenError`.

### 3. Password Hashing Specification
Argon2id configuration aligns with the existing authentication service:
```typescript
await argon2.hash(plainText, {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iterations
  parallelism: 1,    // 1 thread
});
```

---

## 5. Delivery Adapter Architecture and Production Safety

```
                     ┌──────────────────────────────┐
                     │     requestPasswordReset     │
                     └──────────────┬───────────────┘
                                    │
                         getResetDeliveryService()
                                    │
                 ┌──────────────────┴──────────────────┐
                 ▼                                     ▼
        NODE_ENV !== 'prod'                    NODE_ENV === 'prod'
   ┌───────────────────────────┐         ┌───────────────────────────┐
   │ ConsoleResetDeliveryAdapter│         │  SmsResetDeliveryAdapter  │
   ├───────────────────────────┤         ├───────────────────────────┤
   │ Prints reset URL & token  │         │ Checks SMS provider env   │
   │ to console for dev/staging│         │ Fails closed if missing   │
   └───────────────────────────┘         └───────────────────────────┘
```

1. **Console Delivery Adapter (`ConsoleResetDeliveryAdapter`):**
   - Active only when `NODE_ENV !== 'production'`.
   - If accidentally invoked in production, it throws an error to avoid logging secrets.
   - Outputs clear reset URL and debug info to standard console for developer and staging testing.
2. **SMS Delivery Adapter (`SmsResetDeliveryAdapter`):**
   - Active in `production`.
   - Checks for SMS gateway credentials (e.g. AWS SNS, Fast2SMS, Twilio).
   - If unconfigured, logs a sanitized operational warning (`[SMS Delivery] Provider not configured; reset token withheld`) and returns `{ delivered: false }`.
   - `auth.service.ts` detects `{ delivered: false }`, logs the failure, and aborts token creation, returning the standard generic response to the caller without leaking internal configuration state.

---

## 6. Rate Limiting Configuration

Configured in [`apps/api/src/middleware/rate-limiter.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/middleware/rate-limiter.ts) using `express-rate-limit`:

| Limiter | Scope | Window | Max Requests | Response Code / Error |
| :--- | :--- | :--- | :--- | :--- |
| `forgotPasswordIpRateLimiter` | Client IP | 15 minutes | 5 | HTTP 429 (`TOO_MANY_REQUESTS`) |
| `forgotPasswordPhoneRateLimiter` | `phone:${normalizedPhone}` | 15 minutes | 3 | HTTP 429 (`TOO_MANY_REQUESTS`) |
| `verifyResetTokenRateLimiter` | Client IP | 15 minutes | 15 | HTTP 429 (`TOO_MANY_REQUESTS`) |
| `resetPasswordRateLimiter` | Client IP | 15 minutes | 5 | HTTP 429 (`TOO_MANY_REQUESTS`) |

---

## 7. Automated Test Suite Execution

The dedicated automated test suite was executed via:
```bash
npx tsx apps/api/src/tests/auth-password-reset.test.ts
```

### Complete Test Results Matrix

| # | Test Name | Result | Verification Notes |
| :---: | :--- | :---: | :--- |
| **01** | `forgot-password rejects missing community tenant context` | **PASSED** | HTTP 400 returned when `req.communityDb` is absent. |
| **02** | `forgot-password validates phone number format` | **PASSED** | Rejects non-E.164 and invalid prefix numbers with 400. |
| **03** | `forgot-password returns generic 200 for non-existent user` | **PASSED** | Generic success message returned; anti-enumeration verified. |
| **04** | `forgot-password returns generic 200 for suspended user without creating token` | **PASSED** | User status checked; no reset token inserted into store. |
| **05** | `forgot-password creates hashed token with 15m expiry for active user` | **PASSED** | Raw token returned to delivery; SHA-256 hash stored in DB; expiry verified. |
| **06** | `forgot-password invalidates previous active reset tokens for user` | **PASSED** | Pre-existing tokens marked expired (`expiresAt <= now`). |
| **07** | `verify-reset-token rejects invalid hex format` | **PASSED** | Non-64 hex string rejected with HTTP 400 validation error. |
| **08** | `verify-reset-token returns valid=false for non-existent token` | **PASSED** | HTTP 200 with `{ valid: false }` returned. |
| **09** | `verify-reset-token returns valid=false for expired token` | **PASSED** | HTTP 200 with `{ valid: false }` returned for past expiry. |
| **10** | `verify-reset-token returns valid=false for already used token` | **PASSED** | HTTP 200 with `{ valid: false }` returned when `usedAt` is set. |
| **11** | `verify-reset-token returns valid=true for valid active token without leaking user info` | **PASSED** | HTTP 200 with `{ valid: true, expiresAt }` returned; user fields absent. |
| **12** | `reset-password rejects invalid token format or weak password` | **PASSED** | Short password (<8 chars) or bad token rejected with 400. |
| **13** | `reset-password rejects expired or already used token` | **PASSED** | Returns HTTP 400 with `INVALID_RESET_TOKEN`. |
| **14** | `reset-password successfully updates password and marks token used` | **PASSED** | Argon2id hash verified; `usedAt` set; password updated in DB. |
| **15** | `reset-password prevents token reuse (second attempt rejected)` | **PASSED** | Second redemption rejected with `INVALID_RESET_TOKEN`. |
| **16** | `reset-password revokes all existing refresh tokens for user` | **PASSED** | All active refresh tokens have `revokedAt` set to timestamp. |
| **17** | `rate limiter restricts excessive forgot-password requests by phone` | **PASSED** | 4th request within 15 minutes rejected with HTTP 429. |
| **18** | `user cannot log in with old password after reset, can log in with new password` | **PASSED** | Old password fails authentication; new password authenticates cleanly. |

**Total Tests:** 18  
**Passed:** 18  
**Failed:** 0  
**Skipped:** 0  

---

## 8. Monorepo Quality and Regression Verification

### 1. Monorepo TypeScript Typecheck
- **Command:** `npm run typecheck`
- **Output:**
  - `@apnasamaj/shared-types`: Pass (0 errors)
  - `@apnasamaj/validation`: Pass (0 errors)
  - `@apnasamaj/database`: Pass (0 errors)
  - `@apnasamaj/ui-config`: Pass (0 errors)
  - `@apnasamaj/api`: Pass (0 errors)
  - `@apnasamaj/web`: Pass (0 errors)
  - `@apnasamaj/admin`: Pass (0 errors)
- **Result:** **PASSED (0 errors across all 7 packages)**

### 2. Full Workspace Production Build
- **Command:** `npm run build`
- **Output:**
  - `@apnasamaj/shared-types`: Pass (`tsc`)
  - `@apnasamaj/validation`: Pass (`tsc`)
  - `@apnasamaj/database`: Pass (`tsc`)
  - `@apnasamaj/ui-config`: Pass (`tsc`)
  - `@apnasamaj/api`: Pass (`tsc`)
  - `@apnasamaj/admin`: Pass (`tsc && vite build`) — bundle generated
  - `@apnasamaj/web`: Pass (`tsc && vite build`) — bundle generated
- **Result:** **PASSED (0 errors, code 0)**

### 3. Existing Test Regression Suites
- `npm test -w @apnasamaj/database`: **30 / 30 passed**
- `npx tsx apps/api/src/tests/auth-tenant.test.ts`: **35 / 35 passed**
- `npx tsx apps/api/src/tests/appeals-system-integration.test.ts`: **39 / 39 passed**

---

## 9. Security Audit Findings and Safeguards

1. **User Enumeration Prevention:**
   - Both nonexistent phones and suspended accounts return identical HTTP 200 response bodies with standard generic copy: `"If the account exists and is eligible, password reset instructions have been sent."`
   - Response times are kept consistent; suspended account checks avoid unnecessary cryptographic overhead while preserving timing bounds.
2. **Token Security:**
   - Cryptographically secure 256-bit entropy (`crypto.randomBytes(32)`).
   - Only SHA-256 hashes are stored in the database. A database dump or read replica leak does not compromise active reset tokens.
   - Tokens expire automatically after 15 minutes.
   - Requesting a new reset token instantly invalidates any existing unused tokens for that user.
3. **Session Revocation:**
   - Upon successful password reset, all outstanding refresh tokens belonging to the user are revoked immediately (`revokedAt = new Date()`), ensuring lost or compromised devices cannot maintain persistent access.
4. **No Auto-Login:**
   - The password reset endpoint does not return access or refresh tokens. The user must manually navigate to the login screen and prove knowledge of the new password.

---

## 10. Recommendation and Next Steps

The backend implementation for Password Reset is complete, verified, and adheres strictly to all architectural and security constraints.

### Recommendation
**PROCEED TO BATCH 15A.3: Frontend Implementation.**

In Batch 15A.3, the following frontend components will be implemented in `apps/web`:
1. `ForgotPasswordPage` (`/forgot-password`): Phone number input form with localized Hindi/English text and generic confirmation banner.
2. `ResetPasswordPage` (`/reset-password?token=...`): Token preflight verification on mount, password complexity validation, confirmation input, and redirect to login upon success.
3. Login page link: Add "Forgot password?" / "पासवर्ड भूल गए?" link to the existing login forms in `apps/web` and `apps/admin`.
4. Web and API client services: Connect to the verified backend endpoints.

