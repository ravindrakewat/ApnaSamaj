# Apna Samaj — Batch 15B.1: Member Directory Architecture Audit

**Status:** COMPLETE (READ-ONLY AUDIT)  
**Date:** 2026-10-30  
**Target Monorepo:** `c:\sunil kewat\dsas158\ApnaSamaj`  
**Git Checkpoint Reference:** Commit `eb82c0d` (`feat(auth): member self-service password reset, staging e2e verification, and batch 15a reports`)  
**Scope:** Architecture, Privacy, Security, Performance, and Implementation Roadmap for Community Member Directory

---

## 1. Executive Summary

### 1.1 Purpose & Scope
This audit conducts a comprehensive, read-only architectural evaluation of the **Community Member Directory** in the Apna Samaj platform. The directory serves as the core networking hub for community members to locate relatives, explore regional mandals, find individuals by gotra/sub-caste, and discover active community members within their isolated community tenant.

The audit inspects:
- **Database Schema & Models:** Prisma `User` and `Profile` definitions, relation integrity, cascades, and indexing.
- **Backend API & Middleware:** Route definitions, controllers, services, authentication, active-user enforcement, and multi-tenant database routing.
- **Privacy & Data Protection:** Strict masking and exclusion of PII (passwords, auth tokens, phone numbers, date of birth, audit logs).
- **Tenant Isolation:** Cross-tenant boundary verification, tenant resolution fail-closed behavior, and zero-fallback guarantees.
- **Frontend Implementation:** UI pages (`DirectoryPage.tsx`, `MemberProfilePage.tsx`), debouncing, pagination, responsive cards, and API client integration.
- **Performance & Scalability:** Query bounds, N+1 prevention, pagination safety, and index coverage.

### 1.2 Read-Only Mandate Compliance
In strict adherence to the Batch 15B.1 instructions:
- **Zero code modifications** were applied.
- **Zero database migrations** or writes were performed.
- **No Git commits, pushes, or deployments** were initiated.
- **No sensitive credentials or connection strings** are exposed in this report.

---

## 2. Current Architecture & Codebase Inspection

The foundational components of the Member Directory already exist in the codebase from prior development phases. The audit evaluated each layer against enterprise architectural standards.

### 2.1 Database Models (`packages/database/prisma/schema.prisma`)

The member data structure is partitioned across two related models:

```prisma
// packages/database/prisma/schema.prisma (Lines 144-176)
model User {
  id              String     @id @default(uuid())
  phone           String     @unique // Normalized E.164: +91XXXXXXXXXX
  passwordHash    String     // Strictly non-nullable in Phase 1
  isPhoneVerified Boolean    @default(false)
  role            Role       @default(MEMBER)
  status          UserStatus @default(PENDING)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  profile             Profile?
  refreshTokens       RefreshToken[]
  passwordResetTokens PasswordResetToken[]
  // ... relations to Posts, Comments, Groups, etc.

  @@index([role])
  @@index([status])
}

// packages/database/prisma/schema.prisma (Lines 178-195)
model Profile {
  id          String    @id @default(uuid())
  userId      String    @unique
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  fullName    String    // Single source of truth for member name
  gender      Gender?
  dateOfBirth DateTime?
  bio         String?
  avatarUrl   String?
  city        String?
  state       String?
  subCaste    String?
  gotra       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([city, state])
}
```

#### Observations:
1. **Separation of Concerns:** Credentials and authentication metadata live strictly on `User`; public identity attributes live on `Profile`.
2. **Cascade Deletion:** `Profile` maintains `onDelete: Cascade` referencing `User.id`.
3. **Current Indexes:** 
   - `User` is indexed on `role` and `status`.
   - `Profile` is indexed on `[city, state]`.
   - `gotra` and `subCaste` currently **lack dedicated indexes** in `Profile`.

---

### 2.2 API Layer & Route Architecture

The directory functionality is exposed through `apps/api/src/modules/users/users.routes.ts`:

| Method | Endpoint | Middleware Chain | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users` | `authenticateToken`, `requireActiveUser`, `requireTenantContext` | Paginated community directory with search and filters |
| `GET` | `/api/v1/users/:id` | `authenticateToken`, `requireActiveUser`, `requireTenantContext` | Public profile for a specific active community member |
| `GET` | `/api/v1/users/me/profile` | `authenticateToken`, `requireTenantContext` | Private profile of authenticated member (includes phone & DOB) |
| `PATCH`| `/api/v1/users/me/profile` | `authenticateToken`, `requireTenantContext` | Update self profile attributes |
| `POST` | `/api/v1/users/me/avatar` | `authenticateToken`, `requireActiveUser`, `requireTenantContext`, `singleImageUpload` | Upload profile avatar with magic-byte verification |

#### Route Collision Safety:
In [`users.routes.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/users/users.routes.ts#L23-L33), literal routes (`/me/profile`, `/me/avatar`) are mounted **before** parameter route `/:id`, completely preventing route collision where `/me/profile` could be misconstrued as an `:id` parameter.

---

### 2.3 Service Layer & Field Whitelisting

In [`apps/api/src/modules/users/users.service.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/modules/users/users.service.ts#L180-L196), directory retrieval is strictly bound by `publicDirectorySelect`:

```typescript
const publicDirectorySelect = {
  id: true,
  createdAt: true,
  profile: {
    select: {
      id: true,
      fullName: true,
      gender: true,
      bio: true,
      avatarUrl: true,
      city: true,
      state: true,
      subCaste: true,
      gotra: true,
    },
  },
} as const;
```

#### Query Execution & Pagination Logic:
In `getDirectoryMembers` (lines 207–321):
1. **Mandatory Tenant Client:** Throws `UserServiceError(400)` if `db` (PrismaClient) is not provided.
2. **Status Restriction:** Hardcoded `where.status = 'ACTIVE'`.
3. **Filter Application:** Filters on `city`, `state`, and `gotra` using case-insensitive contains.
4. **Free-Text Search:** Cross-field search across `fullName`, `city`, `state`, `gotra`, and `subCaste`.
5. **Page 1 Optimization:** If `page === 1` and `findMany` returns fewer records than `limit`, `totalMembers` is set directly from `results.length`, skipping a redundant `COUNT(*)` query.
6. **Data Mapping:** Directly mapped to `PublicDirectoryMember` objects.

---

### 2.4 Shared Types & Validation Schemas

1. **Validation Schema** ([`packages/validation/src/directory.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/validation/src/directory.ts)):
   ```typescript
   export const directoryQuerySchema = z.object({
     page: z.coerce.number().int().positive().default(1),
     limit: z.coerce.number().int().positive().max(50).default(12),
     search: z.string().trim().optional(),
     city: z.string().trim().optional(),
     state: z.string().trim().optional(),
     gotra: z.string().trim().optional(),
   });
   ```
2. **Shared Types** ([`packages/shared-types/src/user.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/packages/shared-types/src/user.ts#L91-L126)):
   - `PublicDirectoryMember`: `id`, `fullName`, `avatarUrl`, `gender`, `bio`, `city`, `state`, `subCaste`, `gotra`, `joinedAt`.
   - `PublicMemberProfile`: Extends directory attributes with `role`.
   - `DirectoryResponseData`: `members: PublicDirectoryMember[]`, `pagination: { page, limit, totalMembers, totalPages }`.

---

### 2.5 Frontend Web Architecture

1. **Directory Page** ([`apps/web/src/pages/DirectoryPage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/DirectoryPage.tsx)):
   - Material-UI UI with hero banner showing total verified member count.
   - Filter bar: search input (400ms debouncing), city filter, state filter, gotra filter, and "Clear Filters" button.
   - Grid layout of responsive member cards (3 columns on desktop, 2 on tablet, 1 on mobile).
   - Member cards display avatar (fallback to initial), full name, verified badge, location chip, gotra chip, sub-caste chip, truncated bio, and join date.
   - Click handlers route to `/members/:id`.
   - Bounded pagination controls (12 items per page).
2. **Member Profile Page** ([`apps/web/src/pages/MemberProfilePage.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/pages/MemberProfilePage.tsx)):
   - Dedicated public profile view at `/members/:id`.
   - Displays avatar, name, verification badge, community role chip (if admin or moderator), bio, location, gotra, sub-caste, gender, and membership longevity.
   - Back button returning to `/directory` or previous browser history.
3. **Routing** ([`apps/web/src/App.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/App.tsx#L88-L118)):
   - Both `/directory` and `/members/:id` are protected via `<ProtectedRoute>`, requiring an authenticated session.

---

## 3. Privacy & Authorization Audit

### 3.1 Field-by-Field Privacy Matrix

| Field | In Database | Excluded from Directory? | Excluded from Public Profile? | Visible to Self (/me)? | Privacy Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` (User UUID) | `User.id` | **NO** (Public ID) | **NO** (Public ID) | **YES** | Safe opaque routing identifier. |
| `fullName` | `Profile.fullName` | **NO** (Public) | **NO** (Public) | **YES** | Community identification. |
| `avatarUrl` | `Profile.avatarUrl` | **NO** (Public) | **NO** (Public) | **YES** | Profile picture. |
| `phone` | `User.phone` | **YES (STRICTLY HIDDEN)** | **YES (STRICTLY HIDDEN)** | **YES** | **PII Protection.** Phone numbers must not be harvested or publicly visible. |
| `passwordHash` | `User.passwordHash` | **YES (STRICTLY HIDDEN)** | **YES (STRICTLY HIDDEN)** | **YES (HIDDEN FROM SELF TOO)** | Critical credential security. |
| `dateOfBirth` | `Profile.dateOfBirth` | **YES (STRICTLY HIDDEN)** | **YES (STRICTLY HIDDEN)** | **YES** | Identity theft / age privacy protection. |
| `gender` | `Profile.gender` | **NO** (Public) | **NO** (Public) | **YES** | Social/cultural directory attribute. |
| `city` / `state` | `Profile.city/state` | **NO** (Public) | **NO** (Public) | **YES** | Mandal/regional connectivity. |
| `subCaste` / `gotra`| `Profile.subCaste/gotra`| **NO** (Public) | **NO** (Public) | **YES** | Lineage and community discovery. |
| `bio` | `Profile.bio` | **NO** (Public) | **NO** (Public) | **YES** | User self-expression. |
| `role` | `User.role` | **YES (OMITTED)** | **NO** (Public Badge) | **YES** | Displayed on profile only (e.g. MODERATOR, ADMIN). |
| `status` | `User.status` | **YES (OMITTED)** | **YES (OMITTED)** | **YES** | Internal account status must not leak. |
| `createdAt` | `User.createdAt` | **NO** (`joinedAt`) | **NO** (`joinedAt`) | **YES** | Community tenure trust signal. |
| Auth Tokens | `RefreshToken`, `PasswordResetToken` | **YES (STRICTLY HIDDEN)** | **YES (STRICTLY HIDDEN)** | **YES (NEVER RETURNED)** | Session & reset tokens must never leak. |

### 3.2 Authorization & Member Status Invariants
1. **Active Users Only:**
   - Both `/api/v1/users` and `/api/v1/users/:id` enforce `requireActiveUser`.
   - Users with `PENDING` (unverified phone) or `SUSPENDED` status cannot browse the directory or query profiles.
2. **Suspended Account Stealth:**
   - If user `A` attempts to query `/api/v1/users/:suspendedId`, the API returns HTTP 404 (`UserNotFoundError: Member profile not found or unavailable.`).
   - The API **does not** return 403 or distinguish between a non-existent account and a suspended account, preventing attacker enumeration of banned members.

---

## 4. Tenant Isolation & Multi-Community Safety

Apna Samaj utilizes a **multi-tenant architecture with separate PostgreSQL community databases** per community (e.g. `apnasamaj_staging_kewat`, `apnasamaj_prod_kewat`).

```
                    Incoming HTTP Request
                              │
               ┌──────────────▼──────────────┐
               │    resolveTenantContext     │
               │ (Subdomain / Host / Header) │
               └──────────────┬──────────────┘
                              │
                    Is Tenant Configured?
                     ├── YES ──► req.db = tenantDbManager.getClient(slug)
                     │           req.tenant = { slug, isResolved: true }
                     │
                     └── NO ───► req.db = prisma (central)
                                 req.tenant = undefined
                                      │
               ┌──────────────────────▼──────────────────────┐
               │             requireTenantContext            │
               │  Checks req.tenant?.isResolved === true     │
               └──────────────────────┬──────────────────────┘
                                      │
                         Is Tenant Resolved?
                          ├── YES ──► Proceed to Controller
                          │
                          └── NO ───► HTTP 400 Bad Request
                                      (Zero Silent Fallback)
```

### 4.1 Tenant Isolation Guarantees
1. **Explicit Client Binding:**
   - The directory controller reads `req.db` and passes it directly to `getDirectoryMembers(query, req.db)` and `getPublicMemberProfile(id, req.db)`.
   - The service functions explicitly enforce `assertDb(db)` and throw `UserServiceError(400)` if a tenant database is missing. There is **zero fallback to the global singleton**.
2. **Cross-Tenant Snooping Prevention:**
   - Because SQL queries execute solely against the tenant-specific database pool, a member in Tenant A cannot query members of Tenant B, even if they guess or acquire UUIDs from Tenant B.
   - The UUID lookup will return `null` in Tenant A's database, producing a standard 404.
3. **Conflict Detection:**
   - If a client declares `X-Community-Slug: other-community` from a origin/host belonging to `kewat.samaz.in`, `resolveTenantContext` detects a domain mismatch and immediately halts with HTTP 400.

---

## 5. Performance & Scalability Review

### 5.1 Query Complexity & N+1 Prevention
- **Single SQL Query with Joined Relation:**
  Prisma executes `select: { id, createdAt, profile: { select: { ... } } }` either as a single `LEFT JOIN` or two batched single-trip statements using `IN (ids)`. No N+1 queries occur.
- **Selective Column Projection:**
  Only 10 lightweight text/timestamp columns are fetched. Heavy tables (`AuditLog`, `Post`, `RefreshToken`) are completely detached.

### 5.2 Pagination Safety
- `page`: Coerced to positive integer, defaults to 1.
- `limit`: Coerced to positive integer, defaults to 12, **strictly capped at 50** via Zod `.max(50)`.
- Prevents database denial-of-service via unbounded queries like `limit=100000`.

### 5.3 Page 1 Count Optimization
In `getDirectoryMembers`, on `page === 1`:
- If `rawUsers.length < limit`, `totalMembers = rawUsers.length`.
- In small communities or filtered queries with fewer than 12 matches, **zero `COUNT(*)` queries are executed**, cutting database load in half for most initial page loads.

---

## 6. Architectural Gaps & Refinements for Batch 15B.2

While the architecture is fundamentally sound, the audit identified 4 specific gaps that should be addressed in Batch 15B.2:

### Gap 1: Unbounded Query String Lengths
- **Current State:** In `packages/validation/src/directory.ts`, `search`, `city`, `state`, and `gotra` strings are optional and trimmed, but lack a maximum length constraint (`.max(100)`).
- **Risk:** An attacker could submit a 100,000-character search string, triggering expensive regex/ILIKE workload on the PostgreSQL CPU.
- **Recommendation:** Add `.max(100)` to all string parameters in `directoryQuerySchema`.

### Gap 2: Sub-Caste Filter Asymmetry
- **Current State:** `subCaste` is searched in the free-text `search` block (`OR [ fullName, city, state, gotra, subCaste ]`), but is **missing as a dedicated filter parameter** in `directoryQuerySchema`, `DirectoryFilterParams`, and the `where` clause.
- **Recommendation:** Add `subCaste: z.string().trim().max(100).optional()` to the query schema, controller, service where builder, and frontend filters.

### Gap 3: Parameter ID Validation in `GET /users/:id`
- **Current State:** `getPublicProfileHandler` only checks `if (!id)`. If a non-UUID string or SQL injection snippet is provided, it passes down to Prisma, which throws a database formatting error.
- **Recommendation:** Validate `id` against `z.string().uuid()` early in the controller to return a clean HTTP 400 for malformed IDs.

### Gap 4: Database Indexing on Searchable Profile Attributes
- **Current State:** `Profile` has `@@index([city, state])`, but `gotra` and `subCaste` are unindexed.
- **Recommendation:** Plan a future migration for `@@index([gotra])` and `@@index([subCaste])` to ensure fast index scans as community membership grows beyond 10,000 users.

---

## 7. Automated Test Plan for Batch 15B.2

To verify Member Directory functionality and security, Batch 15B.2 should execute a 3-tier test suite:

### 7.1 Tier 1: Unit & Validation Tests
- `directoryQuerySchema` parsing:
  - Validates default values (`page=1`, `limit=12`).
  - Enforces `limit <= 50`.
  - Rejects negative or non-integer page numbers.
  - Rejects query strings exceeding 100 characters.

### 7.2 Tier 2: Tenant Isolation & Service Unit Tests
- Extends `apps/api/src/tests/tenant-bound-service-pilot.test.ts`:
  - `getDirectoryMembers` fails closed if `db` is undefined.
  - `getDirectoryMembers` excludes `phone`, `passwordHash`, `dateOfBirth`, `status`.
  - `getDirectoryMembers` strictly filters to `ACTIVE` members.
  - `getPublicMemberProfile` returns 404 for nonexistent or `SUSPENDED` members.
  - `getPublicMemberProfile` masks phone numbers and auth credentials.

### 7.3 Tier 3: Staging Integration & E2E Verification
- Target: Local staging container (`localhost:5432/apnasamaj_staging_kewat`).
- Seed 3 sample active members with varied cities, gotras, and sub-castes, plus 1 pending member and 1 suspended member.
- Verify:
  - `GET /api/v1/users` returns active members only.
  - Filter by `city="Indore"` returns only Indore members.
  - Filter by `gotra="Kashyap"` returns only Kashyap members.
  - Search by name substring returns matching active members.
  - Neither directory listing nor public profile leaks phone numbers or date of birth.
  - Accessing with missing or invalid `X-Community-Slug` returns HTTP 400.

---

## 8. Summary Table: Component Readiness

| Component | File Path | Current Status | Batch 15B.2 Action Required |
| :--- | :--- | :--- | :--- |
| **Prisma Models** | `packages/database/prisma/schema.prisma` | Ready | Keep existing models; review future indexes. |
| **Zod Query Schema** | `packages/validation/src/directory.ts` | Functional | Add `.max(100)` and add `subCaste` filter. |
| **Shared Types** | `packages/shared-types/src/user.ts` | Ready | Add `subCaste` to `DirectoryFilterParams` if shared. |
| **Routes** | `apps/api/src/modules/users/users.routes.ts` | Ready | Fully configured with middleware. |
| **Controller** | `apps/api/src/modules/users/users.controller.ts` | Functional | Add UUID validation on `:id`. |
| **Service** | `apps/api/src/modules/users/users.service.ts` | Functional | Add `subCaste` filter to where conditions. |
| **Web Directory** | `apps/web/src/pages/DirectoryPage.tsx` | Functional | Optionally add `subCaste` UI filter. |
| **Web Profile** | `apps/web/src/pages/MemberProfilePage.tsx` | Ready | Complete with responsive profile view. |
| **E2E Test Suite** | `apps/api/src/tests/staging-directory-e2e.test.ts` | Missing | Create comprehensive staging E2E test. |

---

## 9. Final Recommendation

### **Recommendation: GO FOR BATCH 15B.2**

The architecture for the Apna Samaj Member Directory is robust, cleanly modularized, and enforces strict privacy and tenant isolation boundaries:
1. **Privacy Invariant:** Zero leakage of phone numbers, password hashes, date of birth, or session tokens.
2. **Tenant Invariant:** Strict fail-closed multi-tenant database routing with no fallback.
3. **Performance Invariant:** Hard-capped pagination (max 50) and single-query relation selects.

The monorepo is fully prepared to proceed with **Batch 15B.2 (Member Directory Refinements, Hardening, and E2E Verification)**.

