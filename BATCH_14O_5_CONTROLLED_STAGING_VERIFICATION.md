# Apna Samaj — Batch 14O.5: Controlled Staging Verification & Preflight Audit

**Audit Date:** 2026-10-29T15:38:00 IST  
**Feature Under Test:** Community Moderation Appeals Workflow  
**Target Community Tenant:** `kewat` (Kewat Samaj)  
**Environment Preflight Result:** **STOPPED — NO ISOLATED STAGING ENVIRONMENT CONFIGURED**  
**Overall Staging Readiness Verdict:** **BLOCKED (ENVIRONMENT NOT CONFIGURED)**

---

## 1. Executive Preflight Summary

In accordance with the strict safety constraints of Batch 14O.5, a preflight inspection was conducted to verify whether a dedicated non-production environment and isolated staging database exist before running live end-to-end tests.

### Critical Preflight Findings:
1. **Database Targeting:** The monorepo's active environment file (`.env`) connects directly to the **live Production Supabase instance** (`aws-0-ap-northeast-1.pooler.supabase.com` / project ref: `tgyrrobrdhbzgheygvdz`).
2. **Absence of Staging Database:** No separate staging database, staging branch, or staging credentials (`STAGING_DATABASE_URL`, `COMMUNITY_KEWAT_STAGING_DATABASE_URL`, `.env.staging`) exist in the repository or local configuration.
3. **Deployment Targets:** Production deployments on Vercel (`apna-samaj.vercel.app`, `apna-samaj-admin.vercel.app`) and Render (`apnasamaj-api.onrender.com`) are live production endpoints serving the `samaz.in` domain, not isolated staging instances.
4. **Safety Enforcement:** In accordance with the explicit constraint:
   > *"If no dedicated staging environment or isolated staging database exists, STOP the end-to-end tests and create a report explaining what needs to be configured. Do not use the Production database for test data."*
   
   All destructive actions, synthetic production appeal submissions, test notifications, and data mutations have been **HALTED**.

---

## 2. Environment Preflight & Isolation Evidence

| Check Item | Configured Setting | Target Infrastructure | Staging Isolation Status |
| :--- | :--- | :--- | :--- |
| **Git Branch** | `main` | `origin/main` (commit `88ce7b8`) | **NO** (Production Trunk) |
| **Active DB (Pooler)** | `DATABASE_URL` (Port 6543) | `aws-0-ap-northeast-1.pooler.supabase.com` (`tgyrrobrdhbzgheygvdz`) | **PRODUCTION** (Not Isolated) |
| **Active DB (Direct DDL)** | `DIRECT_URL` (Port 5432) | `aws-0-ap-northeast-1.pooler.supabase.com` (`tgyrrobrdhbzgheygvdz`) | **PRODUCTION** (Not Isolated) |
| **Supabase Project** | `SUPABASE_URL` | `https://tgyrrobrdhbzgheygvdz.supabase.co` | **PRODUCTION** (Not Isolated) |
| **Client Frontend URL** | `CLIENT_URL` | `http://localhost:5173` | Local Dev Host |
| **Admin Frontend URL** | `ADMIN_URL` | `http://localhost:5174` | Local Dev Host |
| **API Base URL** | `API_BASE_URL` | `http://localhost:4000` (Defaults to local dev API) | Local Dev Host |
| **Staging Config Files** | `.env.staging` / `docker-compose.yml` | None detected in workspace | **MISSING** |
| **Staging Tenants** | `tenantDbManager` | Only `kewat` registered (points to production DB) | **MISSING** |

### Safety Risk of Testing with Current Configuration:
- Running `npm run dev:api` and submitting test appeals would insert synthetic test records directly into the live production tables (`PostAppeal`, `AuditLog`, `Notification`).
- Live production moderators and members could receive confusing notifications ("Appeal Submitted", "Appeal Approved").
- Live audit log history would be polluted with test data.

---

## 3. End-to-End Test Plan (Prepared for Staging Execution)

Once an isolated staging database and test accounts are provisioned, the following 14 test cases must be executed:

| Test ID | Workflow Step | Expected Staging Outcome | Status in this Run |
| :---: | :--- | :--- | :---: |
| **TC-01** | **Moderation Removal Notification** | Member receives `POST_MODERATED` notice with `entityId: <postId>`. | **BLOCKED** (No staging DB) |
| **TC-02** | **Notification Link Resolution** | Clicking notice navigates to `/appeals?postId=<postId>`. | **BLOCKED** (No staging DB) |
| **TC-03** | **Appeal Modal Prefill & Lock** | `AppealSubmissionModal` opens with `postId` prefilled and locked with `Prefilled from Notice` badge. | **BLOCKED** (No staging DB) |
| **TC-04** | **Valid Appeal Submission** | Member submits appeal; record created with status `PENDING`, author `id`, and audit log `APPEAL_SUBMITTED`. | **BLOCKED** (No staging DB) |
| **TC-05** | **Duplicate Appeal Prevention** | Submitting a second appeal for the same post while active returns HTTP 409 Conflict. | **BLOCKED** (No staging DB) |
| **TC-06** | **Member History Visibility** | Submitted appeal appears under `/appeals` with status `Pending Review`. Internal notes omitted. | **BLOCKED** (No staging DB) |
| **TC-07** | **Moderator Queue Ingestion** | Appeal appears in moderator queue under `/moderation/appeals` with author details and status filter. | **BLOCKED** (No staging DB) |
| **TC-08** | **Role-Based Review Authorization** | `MEMBER` attempting to call `POST /api/v1/admin/appeals/:id/review` receives HTTP 403 Forbidden. | **BLOCKED** (No staging DB) |
| **TC-09** | **Moderator Review Action** | Moderator reviews appeal, sets decision (`APPROVED` or `REJECTED`), and records private review notes. | **BLOCKED** (No staging DB) |
| **TC-10** | **Status Transition Integrity** | Status transitions atomically from `PENDING` to terminal state; self-review prohibited. | **BLOCKED** (No staging DB) |
| **TC-11** | **Decision Notification Delivery** | Appellant receives confidential decision notification (`Appeal Approved` / `Appeal Rejected`) without reviewer identity. | **BLOCKED** (No staging DB) |
| **TC-12** | **Member Isolation Check** | Member B calling `GET /api/v1/appeals/me` receives zero records belonging to Member A. | **BLOCKED** (No staging DB) |
| **TC-13** | **Tenant Boundary Isolation** | Gupta community header or unconfigured community access returns HTTP 404 / 400; zero Kewat leak. | **BLOCKED** (No staging DB) |
| **TC-14** | **Input & Concurrency Resilience** | Invalid UUIDs or short reasons rejected (400); racing concurrent decisions handled with 409 Conflict. | **BLOCKED** (No staging DB) |

---

## 4. Required Staging Environment Configuration

To safely unblock Batch 14O.5 for live end-to-end testing, the following infrastructure must be configured:

### 1. Dedicated Staging Database
- Option A (Recommended): Create a secondary Supabase project (e.g., `tgyrrobrdhbzgheygvdz-staging`) or dedicated PostgreSQL database instance.
- Option B (Local Isolated Testing): Run a local PostgreSQL 18 container (via Docker or local service) on an alternate port (e.g., `localhost:5433`).

### 2. Staging Configuration Profile (`.env.staging`)
```dotenv
PORT=4001
NODE_ENV=staging
DATABASE_URL="postgresql://postgres:[PASSWORD]@localhost:5433/apnasamaj_staging?schema=public"
DIRECT_URL="postgresql://postgres:[PASSWORD]@localhost:5433/apnasamaj_staging?schema=public"
CLIENT_URL="http://localhost:5173"
ADMIN_URL="http://localhost:5174"
COMMUNITY_KEWAT_DATABASE_URL="postgresql://postgres:[PASSWORD]@localhost:5433/apnasamaj_staging?schema=public"
JWT_ACCESS_SECRET="test-staging-jwt-access-secret-32-chars-min"
```

### 3. Isolated Staging Seed Data
- Deploy all migrations (`npx prisma migrate deploy`) to the staging database.
- Seed synthetic, isolated test accounts:
  - 1 Test Author Member (`+919999900001` / Member role)
  - 1 Test Intruder Member (`+919999900002` / Member role)
  - 1 Test Moderator (`+919999900003` / Moderator role)
  - 1 Test Moderated Post with an associated `MODERATION_DELETE_POST` audit record.

---

## 5. Defect & Blocker Summary

| Finding | Severity | Description | Resolution |
| :--- | :---: | :--- | :--- |
| **BL-01: Shared Production DB Target** | **CRITICAL (Blocker)** | Root `.env` targets the live Kewat production Supabase instance in Tokyo (`tgyrrobrdhbzgheygvdz`). Running interactive end-to-end tests would pollute production tables and emit live notifications. | **STOPPED**: Testing on Production halted. Staging database required before executing live rounds. |
| **BL-02: Missing Staging Deployments** | **HIGH (Blocker)** | Neither Vercel nor Render has a dedicated preview/staging environment configured for Apna Samaj. | Configure dedicated staging environments or an isolated local sandbox. |

---

## 6. Overall Staging Readiness Verdict

# Status: BLOCKED 🛑

**Reason:** No isolated non-production database or staging environment exists. Production database protection safeguards were strictly observed; zero synthetic test records or mutations were applied to production.

---

## 7. Recommended Next Step

**Batch 14O.6 (Staging Environment Provisioning):**
1. User/Team provisions an isolated staging database (e.g., dedicated Supabase staging project or local test Postgres instance).
2. Configure `.env.staging` with isolated connection strings and test secrets.
3. Apply migrations to the staging database (`npx prisma migrate deploy`).
4. Seed test members, moderator, and a sample moderated post audit log.
5. Execute the 14-point controlled staging test suite against the isolated environment.

